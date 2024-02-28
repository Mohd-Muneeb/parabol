import {InvoiceItemType} from 'parabol-client/types/constEnums'
import getRethink from '../../database/rethinkDriver'
import {RDatum} from '../../database/stricterR'
import Organization from '../../database/types/Organization'
import OrganizationUser from '../../database/types/OrganizationUser'
import insertOrgUserAudit from '../../postgres/helpers/insertOrgUserAudit'
import {OrganizationUserAuditEventTypeEnum} from '../../postgres/queries/generated/insertOrgUserAuditQuery'
import updateUser from '../../postgres/queries/updateUser'
import IUser from '../../postgres/types/IUser'
import {analytics} from '../../utils/analytics/analytics'
import getActiveDomainForOrgId from '../../utils/getActiveDomainForOrgId'
import getDomainFromEmail from '../../utils/getDomainFromEmail'
import handleEnterpriseOrgQuantityChanges from './handleEnterpriseOrgQuantityChanges'
import handleTeamOrgQuantityChanges from './handleTeamOrgQuantityChanges'
import {getUserById} from '../../postgres/queries/getUsersByIds'
import {DataLoaderWorker} from '../../graphql/graphql'
import {Logger} from '../../utils/Logger'

const maybeUpdateOrganizationActiveDomain = async (
  orgId: string,
  newUserEmail: string,
  dataLoader: DataLoaderWorker
) => {
  const r = await getRethink()
  const organization = await r.table('Organization').get(orgId).run()
  const {isActiveDomainTouched, activeDomain} = organization
  // don't modify if the domain was set manually
  if (isActiveDomainTouched) return

  //don't modify if the user doesn't have a company tld or has the same tld as the active one
  const newUserDomain = getDomainFromEmail(newUserEmail)
  if (
    newUserDomain === activeDomain ||
    !(await dataLoader.get('isCompanyDomain').load(newUserDomain))
  )
    return

  // don't modify if we can't guess the domain or the domain we guess is the current domain
  const domain = await getActiveDomainForOrgId(orgId)
  if (!domain || domain === activeDomain) return

  await r
    .table('Organization')
    .get(orgId)
    .update({
      activeDomain: domain
    })
    .run()
}

const changePause = (inactive: boolean) => async (_orgIds: string[], user: IUser) => {
  const r = await getRethink()
  const {id: userId, email} = user
  inactive ? analytics.accountPaused(user) : analytics.accountUnpaused(user)
  analytics.identify({
    userId,
    email,
    isActive: !inactive
  })
  return Promise.all([
    updateUser(
      {
        inactive
      },
      userId
    ),
    r
      .table('OrganizationUser')
      .getAll(userId, {index: 'userId'})
      .filter({removedAt: null})
      .update({inactive})
      .run()
  ])
}

const addUser = async (orgIds: string[], user: IUser, dataLoader: DataLoaderWorker) => {
  const {id: userId} = user
  const r = await getRethink()
  const {organizations, organizationUsers} = await r({
    organizationUsers: r
      .table('OrganizationUser')
      .getAll(userId, {index: 'userId'})
      .orderBy(r.desc('newUserUntil'))
      .coerceTo('array') as unknown as OrganizationUser[],
    organizations: r
      .table('Organization')
      .getAll(r.args(orgIds))
      .coerceTo('array') as unknown as Organization[]
  }).run()

  const docs = orgIds.map((orgId) => {
    const oldOrganizationUser = organizationUsers.find(
      (organizationUser) => organizationUser.orgId === orgId
    )
    const organization = organizations.find((organization) => organization.id === orgId)!
    // continue the grace period from before, if any OR set to the end of the invoice OR (if it is a free account) no grace period
    const newUserUntil =
      (oldOrganizationUser && oldOrganizationUser.newUserUntil) ||
      organization.periodEnd ||
      new Date()
    return new OrganizationUser({
      id: oldOrganizationUser?.id,
      orgId,
      userId,
      newUserUntil,
      tier: organization.tier
    })
  })

  await r.table('OrganizationUser').insert(docs, {conflict: 'replace'}).run()
  await Promise.all(
    orgIds.map((orgId) => {
      return maybeUpdateOrganizationActiveDomain(orgId, user.email, dataLoader)
    })
  )
}

const deleteUser = async (orgIds: string[], user: IUser) => {
  const r = await getRethink()
  orgIds.forEach((orgId) => analytics.userRemovedFromOrg(user, orgId))
  return r
    .table('OrganizationUser')
    .getAll(user.id, {index: 'userId'})
    .filter((row: RDatum) => r.expr(orgIds).contains(row('orgId')))
    .update({
      removedAt: new Date()
    })
    .run()
}

const dbActionTypeLookup = {
  [InvoiceItemType.ADD_USER]: addUser,
  [InvoiceItemType.AUTO_PAUSE_USER]: changePause(true),
  [InvoiceItemType.PAUSE_USER]: changePause(true),
  [InvoiceItemType.REMOVE_USER]: deleteUser,
  [InvoiceItemType.UNPAUSE_USER]: changePause(false)
}

const auditEventTypeLookup = {
  [InvoiceItemType.ADD_USER]: 'added',
  [InvoiceItemType.AUTO_PAUSE_USER]: 'inactivated',
  [InvoiceItemType.PAUSE_USER]: 'inactivated',
  [InvoiceItemType.REMOVE_USER]: 'removed',
  [InvoiceItemType.UNPAUSE_USER]: 'activated'
} as {[key in InvoiceItemType]: OrganizationUserAuditEventTypeEnum}

/**
 * Also adds the organization user if not present
 */
export default async function adjustUserCount(
  userId: string,
  orgInput: string | string[],
  type: InvoiceItemType,
  dataLoader: DataLoaderWorker
) {
  const r = await getRethink()
  const orgIds = Array.isArray(orgInput) ? orgInput : [orgInput]

  const user = (await getUserById(userId))!

  const dbAction = dbActionTypeLookup[type]
  await dbAction(orgIds, user, dataLoader)

  const auditEventType = auditEventTypeLookup[type]
  await insertOrgUserAudit(orgIds, userId, auditEventType)

  const paidOrgs = await r
    .table('Organization')
    .getAll(r.args(orgIds), {index: 'id'})
    .filter((org: RDatum) => org('stripeSubscriptionId').default(null).ne(null))
    .run()

  handleEnterpriseOrgQuantityChanges(paidOrgs, dataLoader).catch()
  handleTeamOrgQuantityChanges(paidOrgs).catch(Logger.error)
}

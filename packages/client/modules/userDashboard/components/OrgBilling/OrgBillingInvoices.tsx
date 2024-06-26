import styled from '@emotion/styled'
import graphql from 'babel-plugin-relay/macro'
import React from 'react'
import {usePaginationFragment} from 'react-relay'
import {OrgBillingInvoices_query$key} from '~/__generated__/OrgBillingInvoices_query.graphql'
import {OrgBillingInvoicesPaginationQuery} from '../../../../__generated__/OrgBillingInvoicesPaginationQuery.graphql'
import Panel from '../../../../components/Panel/Panel'
import SecondaryButton from '../../../../components/SecondaryButton'
import {ElementWidth, Layout} from '../../../../types/constEnums'
import InvoiceRow from '../InvoiceRow/InvoiceRow'

const StyledPanel = styled(Panel)<{isWide: boolean}>(({isWide}) => ({
  maxWidth: isWide ? ElementWidth.PANEL_WIDTH : 'inherit'
}))

const MoreGutter = styled('div')({
  paddingBottom: Layout.ROW_GUTTER
})

const LoadMoreButton = styled(SecondaryButton)({
  margin: '0 auto'
})

interface Props {
  queryRef: OrgBillingInvoices_query$key
  isWide?: boolean
}

const OrgBillingInvoices = (props: Props) => {
  const {queryRef, isWide} = props
  const paginationRes = usePaginationFragment<
    OrgBillingInvoicesPaginationQuery,
    OrgBillingInvoices_query$key
  >(
    graphql`
      fragment OrgBillingInvoices_query on Query
      @refetchable(queryName: "OrgBillingInvoicesPaginationQuery") {
        viewer {
          invoices(first: $first, orgId: $orgId, after: $after)
            @connection(key: "OrgBilling_invoices") {
            edges {
              cursor
              node {
                ...InvoiceRow_invoice
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
    queryRef
  )
  const {data, hasNext, isLoadingNext, loadNext} = paginationRes
  const {viewer} = data
  const {invoices} = viewer
  const loadMore = () => {
    if (!hasNext || isLoadingNext) return
    loadNext(5)
  }
  if (!invoices || !invoices.edges.length) return null
  return (
    <StyledPanel label='Invoices' isWide={!!isWide}>
      <div>
        {invoices.edges.map(({node: invoice}) => (
          <InvoiceRow key={`invoiceRow${invoice.id}`} invoice={invoice} />
        ))}
        {hasNext && (
          <MoreGutter>
            <LoadMoreButton onClick={loadMore}>{'Load More'}</LoadMoreButton>
          </MoreGutter>
        )}
      </div>
    </StyledPanel>
  )
}

export default OrgBillingInvoices

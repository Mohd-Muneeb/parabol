import {RetroLobby_team} from '__generated__/RetroLobby_team.graphql'
import React from 'react'
import styled from 'react-emotion'
import {createFragmentContainer, graphql} from 'react-relay'
import LabelHeading from 'universal/components/LabelHeading/LabelHeading'
import MeetingHelpToggle from 'universal/components/MenuHelpToggle'
import NewMeetingLobby from 'universal/components/NewMeetingLobby'
import PrimaryButton from 'universal/components/PrimaryButton'
import {RetroMeetingPhaseProps} from 'universal/components/RetroMeeting'
import useAtmosphere from 'universal/hooks/useAtmosphere'
import useMutationProps from 'universal/hooks/useMutationProps'
import useRouter from 'universal/hooks/useRouter'
import CopyShortLink from 'universal/modules/meeting/components/CopyShortLink/CopyShortLink'
import MeetingCopy from 'universal/modules/meeting/components/MeetingCopy/MeetingCopy'
import MeetingPhaseHeading from 'universal/modules/meeting/components/MeetingPhaseHeading/MeetingPhaseHeading'
import StartNewMeetingMutation from 'universal/mutations/StartNewMeetingMutation'
import {minWidthMediaQueries} from 'universal/styles/breakpoints'
import {MeetingTypeEnum} from 'universal/types/graphql'
import lazyPreload from 'universal/utils/lazyPreload'
import makeHref from 'universal/utils/makeHref'
import {meetingTypeToLabel, meetingTypeToSlug} from 'universal/utils/meetings/lookups'
import {WithMutationProps} from 'universal/utils/relay/withMutationProps'
import RetroTemplatePicker from '../modules/meeting/components/RetroTemplatePicker'

const ButtonGroup = styled('div')({
  display: 'flex',
  paddingTop: '2.25rem'
})

const ButtonBlock = styled('div')({
  width: '16.125rem'
})

const textAlign = {
  textAlign: 'center' as 'center',
  [minWidthMediaQueries[2]]: {
    textAlign: 'left' as 'left'
  }
}

const StyledLabel = styled(LabelHeading)({...textAlign})
const StyledHeading = styled(MeetingPhaseHeading)({...textAlign})
const StyledCopy = styled(MeetingCopy)({...textAlign})

const UrlBlock = styled('div')({
  margin: '3rem 0 0',
  display: 'inline-block',
  verticalAlign: 'middle'
})

interface Props extends WithMutationProps, RetroMeetingPhaseProps {
  team: RetroLobby_team
}

const StyledButton = styled(PrimaryButton)({
  width: '100%'
})

const TemplatePickerLabel = styled(LabelHeading)({
  margin: '0 0 .75rem'
})

const TemplatePickerBlock = styled('div')({
  margin: '3rem 0 0',
  width: '20rem'
})

const RetroLobbyHelpMenu = lazyPreload(() =>
  import(/* webpackChunkName: 'RetroLobbyHelpMenu' */ 'universal/components/MeetingHelp/RetroLobbyHelpMenu')
)

const meetingType = MeetingTypeEnum.retrospective
const meetingLabel = meetingTypeToLabel[meetingType]
const meetingSlug = meetingTypeToSlug[meetingType]
const buttonLabel = `Start ${meetingLabel} Meeting`

const RetroLobby = (props: Props) => {
  const atmosphere = useAtmosphere()
  const {history} = useRouter()
  const {onError, onCompleted, submitMutation, submitting} = useMutationProps()
  const {team} = props
  const {meetingSettings, id: teamId, name: teamName} = team
  const onStartMeetingClick = () => {
    if (submitting) return
    submitMutation()
    StartNewMeetingMutation(atmosphere, {teamId, meetingType}, {history, onError, onCompleted})
  }
  return (
    <NewMeetingLobby>
      <StyledLabel>{`${meetingLabel} Meeting Lobby`}</StyledLabel>
      <StyledHeading>{`${teamName} ${meetingLabel}`}</StyledHeading>
      <StyledCopy>
        {'The person who presses “Start Meeting” will be today’s Facilitator.'}
        <br />
        <br />
        {'Everyone’s display automatically follows the Facilitator.'}
      </StyledCopy>
      <ButtonGroup>
        <ButtonBlock>
          <StyledButton
            aria-label={buttonLabel}
            onClick={onStartMeetingClick}
            size='large'
            waiting={submitting}
          >
            {buttonLabel}
          </StyledButton>
        </ButtonBlock>
      </ButtonGroup>
      <TemplatePickerBlock>
        <TemplatePickerLabel>Current Template</TemplatePickerLabel>
        <RetroTemplatePicker settings={meetingSettings} />
      </TemplatePickerBlock>
      <UrlBlock>
        <CopyShortLink url={makeHref(`/${meetingSlug}/${teamId}`)} />
      </UrlBlock>
      <MeetingHelpToggle menu={<RetroLobbyHelpMenu />} />
    </NewMeetingLobby>
  )
}

export default createFragmentContainer(
  RetroLobby,
  graphql`
    fragment RetroLobby_team on Team @argumentDefinitions(meetingType: {type: "MeetingTypeEnum!"}) {
      id
      name
      meetingSettings(meetingType: $meetingType) {
        ...RetroTemplatePicker_settings
      }
    }
  `
)

import React from 'react'
import {PreloadedQuery, usePreloadedQuery, useFragment} from 'react-relay'
import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'
import {SimpleModalDialog} from '../ui/Dialog/SimpleModalDialog'
import {DialogContent} from '../ui/Dialog/DialogContent'
import {DialogTitle} from '../ui/Dialog/DialogTitle'
import {DialogDescription} from '../ui/Dialog/DialogDescription'
import {DialogActions} from '../ui/Dialog/DialogActions'
import {DialogClose} from '../ui/Dialog/DialogClose'

import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectValue,
  SelectContent
} from '../ui/Select'
import graphql from 'babel-plugin-relay/macro'
import {ShareTopicModalQuery} from '../__generated__/ShareTopicModalQuery.graphql'
import {ShareTopicModal_viewer$key} from '../__generated__/ShareTopicModal_viewer.graphql'

interface Props {
  isOpen: boolean
  onClose: () => void
  stageId: string
  queryRef: PreloadedQuery<ShareTopicModalQuery>
}

const ShareTopicModalViewerFragment = graphql`
  fragment ShareTopicModal_viewer on User @argumentDefinitions(meetingId: {type: "ID!"}) {
    meeting(meetingId: $meetingId) {
      viewerMeetingMember {
        teamMember {
          integrations {
            slack {
              isActive
            }
          }
        }
      }
    }
  }
`

const query = graphql`
  query ShareTopicModalQuery($meetingId: ID!) {
    viewer {
      ...ShareTopicModal_viewer @arguments(meetingId: $meetingId)
    }
  }
`

type Integration = 'slack'

const ShareTopicModal = (props: Props) => {
  const {isOpen, onClose, queryRef} = props

  const onShare = () => {
    /* TODO */
  }

  const data = usePreloadedQuery<ShareTopicModalQuery>(query, queryRef)
  const viewer = useFragment<ShareTopicModal_viewer$key>(ShareTopicModalViewerFragment, data.viewer)

  const [selectedIntegration, setSelectedIntegration] = React.useState<Integration | ''>('')

  const labelStyles = `w-[90px] text-left text-sm font-semibold`

  const isSlackConnected =
    viewer.meeting?.viewerMeetingMember?.teamMember.integrations.slack?.isActive

  const onIntegrationChange = (integration: Integration) => {
    if (integration === 'slack') {
      if (isSlackConnected) {
        setSelectedIntegration('slack')
      } else {
        // TODO: trigger auth window
      }
    }
  }

  const comingSoonBadge = (
    <div className='flex items-center justify-center rounded-full bg-slate-300 px-3 py-1'>
      <div className='text-center text-xs font-semibold text-slate-600'>coming soon</div>
    </div>
  )

  const connectButton = (
    <div className='flex cursor-pointer items-center justify-center rounded-full border bg-white px-3 py-1'>
      <div className='text-center text-xs font-semibold text-slate-700'>connect</div>
    </div>
  )

  return (
    <SimpleModalDialog isOpen={isOpen} onClose={onClose}>
      <DialogContent>
        <DialogTitle>Share topic</DialogTitle>
        <DialogDescription>Where would you like to share the topic to?</DialogDescription>

        <fieldset className='mx-0 mb-[15px] mb-2 flex items-center gap-5 p-0'>
          <label className={labelStyles}>Integration</label>
          <Select onValueChange={onIntegrationChange} value={selectedIntegration}>
            <SelectTrigger>
              <SelectValue placeholder='Select one' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='slack' endAdornment={!isSlackConnected ? connectButton : null}>
                  Slack
                </SelectItem>
                <SelectItem
                  value='teams'
                  disabled={true}
                  endAdornment={comingSoonBadge}
                  className='data-[disabled]:opacity-100'
                >
                  Teams
                </SelectItem>
                <SelectItem
                  value='mattermost'
                  disabled={true}
                  endAdornment={comingSoonBadge}
                  className='data-[disabled]:opacity-100'
                >
                  Mattermost
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </fieldset>

        <DialogActions>
          <SecondaryButton onClick={onClose} size='small'>
            Cancel
          </SecondaryButton>
          <PrimaryButton size='small' onClick={onShare}>
            Share
          </PrimaryButton>
        </DialogActions>
        <DialogClose />
      </DialogContent>
    </SimpleModalDialog>
  )
}

export default ShareTopicModal

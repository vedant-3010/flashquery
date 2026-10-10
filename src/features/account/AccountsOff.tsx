import { MessagePage } from '@/app/MessagePage'

/** The account pages on a deployment without an account service (F-ACCT-02). */
export function AccountsOff() {
  return (
    <MessagePage
      title="Accounts aren’t set up here"
      description="This deployment has no account service. Everything else works without one: your projects stay in this browser."
    />
  )
}

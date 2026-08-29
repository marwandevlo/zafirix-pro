export {
  ACCOUNT_EMAIL_KEYS,
  buildUserAcceptedEmail,
  buildUserAddedEmail,
  isAccountAcceptedStatus,
  isRecentlyCreatedProfile,
  notifyAccountChange,
  notifyAfterEnsureUserProfile,
  sendAccountNotificationEmail,
  type AccountEmailKey,
  type AccountEmailRecipient,
  type AccountNotificationKind,
  type SendEmailResult,
} from '@/app/lib/email';

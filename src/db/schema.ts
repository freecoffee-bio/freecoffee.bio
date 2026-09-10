import { check, integer, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  issuer: text('issuer'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const verifications = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const twoFactors = sqliteTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
});

export const securitySettings = sqliteTable('security_settings', {
  id: integer('id').primaryKey(),
  turnstileEnabled: integer('turnstile_enabled', { mode: 'boolean' }).notNull().default(false),
  turnstileSiteKey: text('turnstile_site_key').notNull().default(''),
  turnstileSecretKey: text('turnstile_secret_key').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const adminBootstrap = sqliteTable('admin_bootstrap', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const siteSettings = sqliteTable('site_settings', {
  id: integer('id').primaryKey(),
  siteUrl: text('site_url').notNull().default(''),
  siteName: text('site_name').notNull().default('FreeCoffee.bio'),
  currency: text('currency').notNull().default('USD'),
  taxRate: integer('tax_rate').notNull().default(0),
  paymentProviders: text('payment_providers').notNull().default('{}'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});


export const exchangeRates = sqliteTable('exchange_rates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  baseCurrency: text('base_currency').notNull().default('USD'),
  quoteCurrency: text('quote_currency').notNull(),
  rate: text('rate').notNull(),
  source: text('source').notNull().default('manual'),
  effectiveAt: integer('effective_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('exchange_rates_base_quote_unique').on(table.baseCurrency, table.quoteCurrency),
]);

export const s3StorageSettings = sqliteTable('s3_storage_settings', {
  id: integer('id').primaryKey(),
  endpoint: text('endpoint').notNull(),
  region: text('region').notNull().default('us-east-1'),
  bucket: text('bucket').notNull(),
  pathPrefix: text('path_prefix').notNull().default('media'),
  accessKeyId: text('access_key_id').notNull(),
  secretAccessKey: text('secret_access_key').notNull(),
  forcePathStyle: integer('force_path_style', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const creatorProfiles = sqliteTable('creator_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  whatDo: text('what_do'),
  website: text('website'),
  image: text('image'),
  socialLinks: text('social_links'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const creatorPageSettings = sqliteTable('creator_page_settings', {
  creatorId: integer('creator_id').primaryKey().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  themeColor: text('theme_color').notNull().default('#111111'),
  welcomeMessage: text('welcome_message'),
  defaultSupportAmount: integer('default_support_amount').notNull().default(500),
  allowAnonymous: integer('allow_anonymous', { mode: 'boolean' }).notNull().default(true),
  showSupport: integer('show_support', { mode: 'boolean' }).notNull().default(true),
  showShop: integer('show_shop', { mode: 'boolean' }).notNull().default(true),
  supportGoalEnabled: integer('support_goal_enabled', { mode: 'boolean' }).notNull().default(false),
  supportGoalTitle: text('support_goal_title'),
  supportGoalAmount: integer('support_goal_amount'),
  supportGoalDescription: text('support_goal_description'),
  terms: text('terms'),
  analyticsCode: text('analytics_code'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const creatorPaymentAccounts = sqliteTable('creator_payment_accounts', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalAccountId: text('external_account_id'),
  status: text('status').notNull().default('not_connected'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  connectedAt: integer('connected_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('creator_payment_accounts_provider_unique').on(table.creatorId, table.provider)]);

export const creatorCryptoWallets = sqliteTable('creator_crypto_wallets', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  network: text('network').notNull(),
  asset: text('asset').notNull(),
  address: text('address').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('creator_crypto_wallet_unique').on(table.creatorId, table.network, table.asset)]);

export const smtpSettings = sqliteTable('smtp_settings', {
  id: integer('id').primaryKey(),
  host: text('host').notNull().default(''),
  port: integer('port').notNull().default(587),
  username: text('username').notNull().default(''),
  password: text('password').notNull().default(''),
  secure: integer('secure', { mode: 'boolean' }).notNull().default(true),
  fromAddress: text('from_address').notNull().default(''),
  replyTo: text('reply_to'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const emailDeliverySettings = sqliteTable('email_delivery_settings', {
  id: integer('id').primaryKey(),
  activeProvider: text('active_provider'),
  apiProviders: text('api_providers').notNull().default('{}'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const supportTransactions = sqliteTable('support_transactions', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  supporterUserId: text('supporter_user_id').references(() => users.id, { onDelete: 'set null' }),
  supporterEmail: text('supporter_email').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('pending'),
  message: text('message'),
  displayName: text('display_name'),
  anonymous: integer('anonymous', { mode: 'boolean' }).notNull().default(false),
  provider: text('provider'),
  providerPaymentId: text('provider_payment_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
}, (table) => [
  index('support_transactions_creator_id_idx').on(table.creatorId),
  index('support_transactions_supporter_user_id_idx').on(table.supporterUserId),
  index('support_transactions_status_idx').on(table.status),
]);

export const galleryItems = sqliteTable('gallery_items', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  albumId: text('album_id'),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url').notNull(),
  linkUrl: text('link_url'),
  status: text('status').notNull().default('draft'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  coverImageUrl: text('cover_image_url'),
  body: text('body').notNull(),
  status: text('status').notNull().default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const contentComments = sqliteTable('content_comments', {
  id: text('id').primaryKey(),
  contentType: text('content_type').notNull(),
  contentId: text('content_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('content_comments_content_idx').on(table.contentType, table.contentId, table.createdAt),
]);

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  coverImageUrl: text('cover_image_url'),
  productType: text('product_type').notNull().default('digital'),
  price: integer('price').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  status: text('status').notNull().default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const productFiles = sqliteTable('product_files', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull(),
  checksum: text('checksum'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('product_files_product_id_unique').on(table.productId),
]);

export const mediaFiles = sqliteTable('media_files', {
  id: text('id').primaryKey(),
  originalName: text('original_name').notNull(),
  objectKey: text('object_key').notNull().unique(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  fileSize: integer('file_size').notNull(),
  folder: text('folder'),
  publicUrl: text('public_url').notNull(),
  uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  creatorId: integer('creator_id').notNull().references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  buyerUserId: text('buyer_user_id').references(() => users.id, { onDelete: 'set null' }),
  buyerEmail: text('buyer_email').notNull(),
  subtotalAmount: integer('subtotal_amount').notNull().default(0),
  taxRate: integer('tax_rate').notNull().default(0),
  taxAmount: integer('tax_amount').notNull().default(0),
  totalAmount: integer('total_amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  settlementCurrency: text('settlement_currency'),
  settlementAmount: integer('settlement_amount'),
  exchangeRate: text('exchange_rate'),
  exchangeRateSource: text('exchange_rate_source'),
  exchangeRateAt: integer('exchange_rate_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('pending'),
  provider: text('provider'),
  providerPaymentId: text('provider_payment_id'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  closeReason: text('close_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }),
}, (table) => [
  index('orders_creator_id_idx').on(table.creatorId),
  index('orders_buyer_user_id_idx').on(table.buyerUserId),
  index('orders_status_idx').on(table.status),
  index('orders_status_expires_at_idx').on(table.status, table.expiresAt),
]);

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitAmount: integer('unit_amount').notNull(),
}, (table) => [
  uniqueIndex('order_items_order_product_unique').on(table.orderId, table.productId),
  check('order_items_quantity_positive', sql`${table.quantity} > 0`),
  check('order_items_unit_amount_nonnegative', sql`${table.unitAmount} >= 0`),
]);


export const paymentEvents = sqliteTable('payment_events', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('received'),
  error: text('error'),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('payment_events_provider_event_unique').on(table.provider, table.providerEventId),
]);

export const notificationTemplates = sqliteTable('notification_templates', {
  id: text('id').primaryKey(),
  eventKey: text('event_key').notNull(),
  channel: text('channel').notNull().default('email'),
  displayName: text('display_name').notNull(),
  description: text('description').notNull().default(''),
  subject: text('subject').notNull().default(''),
  bodyText: text('body_text').notNull(),
  bodyHtml: text('body_html'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('notification_templates_event_channel_unique').on(table.eventKey, table.channel),
]);

export const notificationDeliveries = sqliteTable('notification_deliveries', {
  id: text('id').primaryKey(),
  channel: text('channel').notNull().default('email'),
  recipient: text('recipient').notNull(),
  template: text('template').notNull(),
  referenceId: text('reference_id'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  payloadJson: text('payload_json'),
  dedupeKey: text('dedupe_key').unique(),
  availableAt: integer('available_at', { mode: 'timestamp' }),
  lockedAt: integer('locked_at', { mode: 'timestamp' }),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const paymentRecords = sqliteTable('payment_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  referenceId: text('reference_id').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  provider: text('provider').notNull(),
  providerPaymentId: text('provider_payment_id'),
  status: text('status').notNull().default('pending'),
  rawReference: text('raw_reference'),
  network: text('network'),
  asset: text('asset'),
  walletAddress: text('wallet_address'),
  transactionHash: text('transaction_hash'),
  confirmations: integer('confirmations'),
  requiredConfirmations: integer('required_confirmations'),
  quotedAmount: integer('quoted_amount'),
  quotedCurrency: text('quoted_currency'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('payment_records_provider_reference_unique').on(table.provider, table.referenceId),
  uniqueIndex('payment_records_provider_payment_unique').on(table.provider, table.providerPaymentId),
  index('payment_records_reference_id_idx').on(table.referenceId),
  index('payment_records_user_id_idx').on(table.userId),
]);

export type User = typeof users.$inferSelect;

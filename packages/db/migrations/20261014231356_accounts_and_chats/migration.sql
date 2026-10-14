CREATE TABLE `account_secrets` (
	`account_id` text PRIMARY KEY,
	`ciphertext` text NOT NULL,
	CONSTRAINT `fk_account_secrets_account_id_provider_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `provider_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`provider` text,
	`model` text,
	`account_id` text,
	`account_label` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`reasoning_tokens` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_messages_chat_id_chats_id_fk` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `provider_accounts` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`auth_type` text NOT NULL,
	`priority` integer NOT NULL,
	`key_hint` text NOT NULL,
	`status` text NOT NULL,
	`unavailable_until` integer,
	`last_error` text,
	`models` text NOT NULL,
	`validated_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chats_updated_at` ON `chats` (`updated_at`);--> statement-breakpoint
CREATE INDEX `messages_chat_created` ON `messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `provider_accounts_provider_priority` ON `provider_accounts` (`provider`,`priority`);
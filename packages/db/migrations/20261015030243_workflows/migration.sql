CREATE TABLE `plan_steps` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`category` text,
	`depends_on` text NOT NULL,
	`outputs` text NOT NULL,
	`rationale` text NOT NULL,
	`provider` text,
	`model` text,
	`effort` text,
	`account_id` text,
	`account_label` text,
	`status` text NOT NULL,
	`report` text NOT NULL,
	`error` text,
	`input_tokens` integer,
	`cached_input_tokens` integer,
	`output_tokens` integer,
	`reasoning_tokens` integer,
	`cost_usd` real,
	`started_at` integer,
	`finished_at` integer,
	CONSTRAINT `fk_plan_steps_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`message_id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`spec` text NOT NULL,
	`manager_provider` text,
	`manager_model` text,
	`pinned` text,
	`plan_mode` text NOT NULL,
	`estimated_cost_usd` real,
	`estimated_seconds` real,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_plans_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workspace_files` (
	`id` text PRIMARY KEY,
	`chat_id` text NOT NULL,
	`message_id` text NOT NULL,
	`step_key` text NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_workspace_files_chat_id_chats_id_fk` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_files_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `cached_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `cost_usd` real;--> statement-breakpoint
ALTER TABLE `messages` ADD `output_mode` text;--> statement-breakpoint
CREATE UNIQUE INDEX `plan_steps_message_key` ON `plan_steps` (`message_id`,`key`);--> statement-breakpoint
CREATE INDEX `workspace_files_chat_path` ON `workspace_files` (`chat_id`,`path`);
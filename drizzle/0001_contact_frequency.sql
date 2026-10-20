CREATE TYPE "public"."contact_frequency" AS ENUM('week', 'month', 'quarter', 'year');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_frequency" "contact_frequency";
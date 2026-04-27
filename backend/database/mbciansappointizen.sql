-- MBCIANS APPOINTIZEN
-- Registrar Appointment System bootstrap schema + seed data
-- Run this after selecting or creating your target database.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `payment_history`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `activity_logs`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `appointments`;
DROP TABLE IF EXISTS `blocked_dates`;
DROP TABLE IF EXISTS `time_slots`;
DROP TABLE IF EXISTS `document_types`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `firstname` VARCHAR(100) NOT NULL,
  `lastname` VARCHAR(100) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `student_id` VARCHAR(100) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('student', 'admin', 'cashier', 'registrar_staff', 'registrar_head') NOT NULL DEFAULT 'student',
  `account_status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  UNIQUE KEY `uk_users_student_id` (`student_id`),
  KEY `idx_users_role_status` (`role`, `account_status`),
  KEY `idx_users_lastname_firstname` (`lastname`, `firstname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `document_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `base_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `copy_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `rush_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `processing_days` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_document_types_name` (`name`),
  KEY `idx_document_types_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `time_slots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `max_appointments` INT UNSIGNED NOT NULL DEFAULT 10,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_time_slots_window` (`start_time`, `end_time`),
  KEY `idx_time_slots_active_start` (`is_active`, `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `org_name` VARCHAR(180) NOT NULL,
  `org_email` VARCHAR(190) NOT NULL,
  `org_phone` VARCHAR(20) NOT NULL,
  `office_hours` VARCHAR(255) NOT NULL,
  `gcash_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `gcash_name` VARCHAR(120) DEFAULT NULL,
  `gcash_number` VARCHAR(20) DEFAULT NULL,
  `gcash_qr_image` VARCHAR(255) DEFAULT NULL,
  `cash_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `maintenance_mode` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `blocked_dates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `blocked_date` DATE NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `created_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_blocked_dates_date` (`blocked_date`),
  KEY `idx_blocked_dates_created_by` (`created_by`),
  CONSTRAINT `fk_blocked_dates_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `appointments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference_no` VARCHAR(40) NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `document_type_id` BIGINT UNSIGNED NOT NULL,
  `time_slot_id` BIGINT UNSIGNED NOT NULL,
  `appointment_date` DATE NOT NULL,
  `copies` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_rush` TINYINT(1) NOT NULL DEFAULT 0,
  `purpose` VARCHAR(255) NOT NULL,
  `remarks` VARCHAR(500) DEFAULT NULL,
  `rejection_reason` VARCHAR(500) DEFAULT NULL,
  `status` ENUM('pending', 'approved', 'assigned', 'processing', 'completed', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `payment_status` ENUM('unpaid', 'pending', 'for_verification', 'paid', 'rejected') NOT NULL DEFAULT 'unpaid',
  `assigned_staff_id` BIGINT UNSIGNED DEFAULT NULL,
  `approved_by` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_appointments_reference_no` (`reference_no`),
  KEY `idx_appointments_student` (`student_id`),
  KEY `idx_appointments_status_date` (`status`, `appointment_date`),
  KEY `idx_appointments_date_slot` (`appointment_date`, `time_slot_id`),
  KEY `idx_appointments_payment_status` (`payment_status`),
  KEY `idx_appointments_assigned_staff` (`assigned_staff_id`),
  CONSTRAINT `fk_appointments_student`
    FOREIGN KEY (`student_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_appointments_document_type`
    FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_appointments_time_slot`
    FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_appointments_assigned_staff`
    FOREIGN KEY (`assigned_staff_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_appointments_approved_by`
    FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `appointment_id` BIGINT UNSIGNED NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `method` ENUM('gcash', 'cash') NOT NULL,
  `proof_image` MEDIUMTEXT DEFAULT NULL,
  `reference_number` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('pending', 'for_verification', 'paid', 'rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` VARCHAR(255) DEFAULT NULL,
  `reviewed_by` BIGINT UNSIGNED DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payments_appointment_id` (`appointment_id`),
  KEY `idx_payments_status` (`status`),
  KEY `idx_payments_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_payments_appointment`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_payments_reviewed_by`
    FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `payment_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payment_id` BIGINT UNSIGNED NOT NULL,
  `from_status` VARCHAR(30) NOT NULL,
  `to_status` VARCHAR(30) NOT NULL,
  `note` VARCHAR(500) DEFAULT NULL,
  `actor_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_history_payment_created` (`payment_id`, `created_at`),
  KEY `idx_payment_history_actor` (`actor_id`),
  CONSTRAINT `fk_payment_history_payment`
    FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_payment_history_actor`
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `type` ENUM('info', 'success', 'warning', 'error') NOT NULL DEFAULT 'info',
  `reference_type` VARCHAR(50) DEFAULT NULL,
  `reference_id` BIGINT UNSIGNED DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read_created` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `activity_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(120) NOT NULL,
  `entity_type` VARCHAR(50) DEFAULT NULL,
  `entity_id` BIGINT UNSIGNED DEFAULT NULL,
  `description` VARCHAR(255) NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_logs_user_created` (`user_id`, `created_at`),
  KEY `idx_activity_logs_action_created` (`action`, `created_at`),
  CONSTRAINT `fk_activity_logs_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `settings` (
  `id`,
  `org_name`,
  `org_email`,
  `org_phone`,
  `office_hours`,
  `gcash_enabled`,
  `gcash_name`,
  `gcash_number`,
  `gcash_qr_image`,
  `cash_enabled`,
  `maintenance_mode`
) VALUES (
  1,
  'Mindoro State University - Registrar',
  'registrar@minsu.edu.ph',
  '09123456789',
  'Monday to Friday, 8:00 AM - 5:00 PM',
  1,
  'MBCIANS APPOINTIZEN',
  '09123456789',
  '/assets/qr-code.jpg',
  1,
  0
);

INSERT INTO `document_types` (`name`, `description`, `base_fee`, `copy_fee`, `rush_fee`, `processing_days`, `is_active`) VALUES
  ('Certificate of Enrollment', 'Official proof of current enrollment status.', 100.00, 15.00, 50.00, 2, 1),
  ('Transcript of Records', 'Official transcript request for transfer or employment.', 250.00, 25.00, 100.00, 5, 1),
  ('Good Moral Certificate', 'Issued for scholarship, transfer, or employment requirements.', 80.00, 10.00, 40.00, 2, 1),
  ('Certified True Copy of Grades', 'Certified copy of grades for previous terms.', 120.00, 15.00, 50.00, 3, 1),
  ('Diploma / Graduation Document', 'Document request for graduation-related records.', 300.00, 30.00, 125.00, 7, 1);

INSERT INTO `time_slots` (`start_time`, `end_time`, `max_appointments`, `is_active`) VALUES
  ('08:00:00', '09:00:00', 20, 1),
  ('09:00:00', '10:00:00', 20, 1),
  ('10:00:00', '11:00:00', 20, 1),
  ('13:00:00', '14:00:00', 20, 1),
  ('14:00:00', '15:00:00', 20, 1),
  ('15:00:00', '16:00:00', 20, 1);

INSERT INTO `users` (
  `firstname`,
  `lastname`,
  `email`,
  `phone`,
  `student_id`,
  `password_hash`,
  `role`,
  `account_status`
) VALUES
  ('Admin', 'Account', 'admin@mbciansappointizen.local', '09170000001', NULL, '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'admin', 'active'),
  ('Cashier', 'Account', 'cashier@mbciansappointizen.local', '09170000002', NULL, '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'cashier', 'active'),
  ('Head', 'Registrar', 'head@mbciansappointizen.local', '09170000003', NULL, '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'registrar_head', 'active'),
  ('Staff1', 'Registrar', 'staff1@mbciansappointizen.local', '09170000004', NULL, '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'registrar_staff', 'active'),
  ('Staff2', 'Registrar', 'staff2@mbciansappointizen.local', '09170000005', NULL, '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'registrar_staff', 'active'),
  ('Brendon', 'Flores', 'brendon.student@mbciansappointizen.local', '09170000006', 'MBC2026-00001', '$2b$10$denTz6HdDWgU5DbFZ55Vjex7nnAAfbt/hOgK4BDwd57Um.gGVbc/e', 'student', 'active');

-- Default password for seeded accounts:
-- ChangeMe123!

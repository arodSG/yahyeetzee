-- Run this manually with the MySQL command line or phpMyAdmin

CREATE DATABASE IF NOT EXISTS `yahyeetzee`;
USE `yahyeetzee`;


CREATE TABLE IF NOT EXISTS `users` (
    `id` int NOT NULL,
    `username` varchar(16) NOT NULL,
    `email` varchar(255) NOT NULL,
    `password` varchar(128) NOT NULL,
    `is_verified` tinyint NOT NULL DEFAULT 0,
    `verification_send_date` timestamp DEFAULT NULL,
    `created_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users`
    ADD PRIMARY KEY (`id`),
    ADD UNIQUE KEY `username` (`username`),
    ADD UNIQUE KEY `email` (`email`),
    MODIFY `id` int NOT NULL AUTO_INCREMENT;


CREATE TABLE IF NOT EXISTS `single_games` (
    `id` int NOT NULL,
    `user_id` int NOT NULL,
    `bonus` tinyint NOT NULL,
    `yahtzees` tinyint NOT NULL,
    `score` int NOT NULL,
    `created_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `single_games`
    ADD PRIMARY KEY (`id`),
    ADD CONSTRAINT `single_games_FK_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `single_games`
    MODIFY `id` int NOT NULL AUTO_INCREMENT;


CREATE TABLE IF NOT EXISTS `multi_games` (
    `id` int NOT NULL,
    `user_id` int NOT NULL,
    `bonus` tinyint NOT NULL,
    `yahtzees` tinyint NOT NULL,
    `score` int NOT NULL,
    `win` tinyint NOT NULL,
    `created_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `multi_games`
    ADD PRIMARY KEY (`id`),
    ADD CONSTRAINT `multi_games_FK_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `multi_games`
    MODIFY `id` int NOT NULL AUTO_INCREMENT;
  
COMMIT;
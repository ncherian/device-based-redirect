<?php

// If uninstall not called from WordPress, exit
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Access WordPress database
global $wpdb;

// Get table name with prefix and escape it
$redirects_table = esc_sql($wpdb->prefix . 'dbre_redirects');

// Drop the redirects table with proper preparation
// phpcs:ignore WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Intended schema change during plugin uninstallation
$wpdb->query(
    $wpdb->prepare(
        "DROP TABLE IF EXISTS %s",
        $redirects_table
    )
);

// Remove all plugin options
delete_option('dbre_db_version');
delete_option('dbre_migration_complete');
delete_option('dbre_entries'); // Remove old options data if exists

// Clear any cached data
wp_cache_flush();
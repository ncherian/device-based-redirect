<?php

// If uninstall not called from WordPress, exit
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Access WordPress database
global $wpdb;

// Get table name with prefix
$redirects_table = $wpdb->prefix . 'dbre_redirects';

// Drop the redirects table
$wpdb->query("DROP TABLE IF EXISTS $redirects_table");

// Remove all plugin options
delete_option('dbre_db_version');
delete_option('dbre_migration_complete');
delete_option('dbre_entries'); // Remove old options data if exists

// Clear any cached data
wp_cache_flush();


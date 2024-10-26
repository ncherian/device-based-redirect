<?php
// If uninstall not called from WordPress, exit
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Delete all plugin options
delete_option('device_redirect_pages');
delete_option('device_redirect_enabled');
delete_option('device_redirect_version');

// Clean up any additional options or custom post types if needed
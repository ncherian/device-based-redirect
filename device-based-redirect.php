<?php
/*
Plugin Name: Device-Based Redirect
Plugin URI:  https://github.com/ncherian/device-based-redirect
Description: Device-Based Redirect enables dynamic redirection of users to mobile-friendly URLs or the App Store/Google Play Store, tailored to their device type (iOS/Android).You can select specific pages or set up custom URLs effortlessly.
Version:     1.1.6
Author:      Indimakes
Author URI:  https://indimakes.com
License:     GPL2
*/


// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// ===============================================
// Plugin Activation/Deactivation
// ===============================================

register_deactivation_hook(__FILE__, 'dbre_deactivate');
add_action('plugins_loaded', 'dbre_check_version');

// Check Version and Run Migration if needed
function dbre_check_version() {
    $current_version = get_option('dbre_version', '0');
    $current_db_version = get_option('dbre_db_version', '0');
    
    // Check if this is a new installation or upgrade
    if (version_compare($current_version, DBRE_VERSION, '<') || 
        version_compare($current_db_version, DBRE_DB_VERSION, '<')) {
        
        // Ensure the table exists
        global $wpdb;
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

        // Create or update redirects table
        $redirects_sql = "CREATE TABLE IF NOT EXISTS " . dbre_get_table_name() . " (
            `id` bigint(20) NOT NULL AUTO_INCREMENT,
            `type` enum('page', 'custom') NOT NULL,
            `reference_id` varchar(191) NOT NULL,
            `title` varchar(191) DEFAULT NULL,
            `ios_url` text DEFAULT NULL,
            `android_url` text DEFAULT NULL,
            `backup_url` text DEFAULT NULL,
            `enabled` tinyint(1) DEFAULT 0,
            `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
            `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            `order` int(11) DEFAULT 0,
            PRIMARY KEY (`id`),
            UNIQUE KEY `type_reference` (`type`, `reference_id`),
            KEY `enabled` (`enabled`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";

        dbDelta($redirects_sql);

        // Check if title column exists
        $table_name = dbre_get_table_name();
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $row = $wpdb->get_results(
            $wpdb->prepare(
                "SHOW COLUMNS FROM `" . esc_sql($table_name) . "` WHERE Field = %s",
                'title'
            )
        );
        
        if (empty($row)) {
            // Add title column if it doesn't exist
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
            $wpdb->query("ALTER TABLE `" . esc_sql($table_name) . "` ADD COLUMN `title` varchar(191) DEFAULT NULL AFTER `reference_id`");
        }

        // Run migration if needed
        if (version_compare($current_db_version, DBRE_DB_VERSION, '<')) {
            dbre_run_migration();
            update_option('dbre_db_version', DBRE_DB_VERSION);
        }

        // Update plugin version
        update_option('dbre_version', DBRE_VERSION);
    }
}

function dbre_deactivate() {
    // Clear all Trasients
    $redirects = dbre_get_redirects();
    foreach ($redirects as $redirect) {
        if ($redirect['type'] === 'page') {
            delete_transient('dbre_redirect_' . $redirect['reference_id']);
        } else if ($redirect['type'] === 'custom') {
            delete_transient('dbre_custom_redirect_' . md5($redirect['reference_id']));
        }
    }
}

// ===============================================
// Admin UI Setup (React Integration)
// ===============================================

add_action('admin_menu', 'dbre_menu');
add_action('admin_enqueue_scripts', 'dbre_scripts');
add_action('template_redirect', 'dbre_redirect_logic');
add_action('parse_request', 'dbre_handle_custom_slugs', 1);
add_action('init', 'dbre_modify_redirect_canonical', 0);
add_action('wp_ajax_save_device_redirect_settings', 'dbre_save_settings');
add_filter('wp_unique_post_slug', 'dbre_handle_slug_conflicts', 10, 6);
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'dbre_add_plugin_action_links');

// Register the AJAX action for dismissing the review request
add_action('wp_ajax_dbre_dismiss_review', 'dbre_handle_dismiss_review');

// define('DEVICE_REDIRECT_MINIMUM_WP_VERSION', '5.0');
// define('DEVICE_REDIRECT_MINIMUM_PHP_VERSION', '7.2');
// URL pattern constants
define('DBRE_VERSION', '1.1.6');
define('DBRE_IOS_URL_PATTERN', '/^https:\/\/apps\.apple\.com/');
define('DBRE_ANDROID_URL_PATTERN', '/^https:\/\/play\.google\.com/');
// Option names
define('DBRE_SETTINGS_KEY', 'dbre_entries');
define('DBRE_DB_VERSION', '1.1');

function dbre_menu() {
    add_menu_page(
        'Device Based Redirection',  // Page title
        'Device Redirects',          // Menu title
        'manage_options',            // Capability
        'device-redirects',          // Menu slug
        'dbre_settings_page',        // Function to display the page
        'dashicons-smartphone',      // Icon (using smartphone dashicon)
        30                          // Position in menu (lower number = higher position)
    );
}

function dbre_settings_page() {
    echo '<div id="device-redirect-settings"></div>';
}

function dbre_scripts($hook) {
    if ($hook !== 'toplevel_page_device-redirects') {
        return;
    }

    wp_enqueue_script(
        'device-redirect-react',
        plugins_url('build/index.js', __FILE__),
        ['wp-element'],
        filemtime(plugin_dir_path(__FILE__) . 'build/index.js'),
        true
    );

    $all_pages = get_pages();
    $formatted_pages = array_map(function($page) {
        return [
            'value' => (string)$page->ID,
            'label' => $page->post_title,
            'slug' => $page->post_name
        ];
    }, $all_pages);

    // Check if there are any redirects and if review hasn't been dismissed
    global $wpdb;

    $show_review = get_option('dbre_review_dismissed', 0) < 1;

    wp_localize_script('device-redirect-react', 'deviceRedirectData', [
        'nonce' => wp_create_nonce('device_redirect_nonce'),
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'restUrl' => rest_url(),
        'restNonce' => wp_create_nonce('wp_rest'),
        'homeUrl' => home_url(),
        'pages' => $formatted_pages,
        'pluginUrl' => plugins_url('', __FILE__),
        'showReviewRequest' => $show_review
    ]);
}

function dbre_save_settings() {
    check_ajax_referer('device_redirect_nonce', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Unauthorized', 403);
    }

    if (!isset($_POST['settings'])) {
        wp_send_json_error('No settings data provided', 400);
    }

    $raw_settings = sanitize_text_field(wp_unslash($_POST['settings']));
    $settings = json_decode($raw_settings, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        wp_send_json_error('Invalid JSON data', 400);
    }

    if (!is_array($settings)) {
        wp_send_json_error('Invalid settings format', 400);
    }

    global $wpdb;
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
    $wpdb->query('START TRANSACTION');

    try {
        $saved_entries = [];
        $deleted_count = 0;

        foreach ($settings as $key => $value) {
            $type = isset($value['type']) ? $value['type'] : 'custom';
            
            $redirect_data = [
                'type' => $type,
                'reference_id' => $key,
                'title' => isset($value['title']) ? sanitize_text_field($value['title']) : null,
                'ios_url' => isset($value['ios_url']) ? esc_url_raw($value['ios_url']) : '',
                'android_url' => isset($value['android_url']) ? esc_url_raw($value['android_url']) : '',
                'backup_url' => isset($value['backup_url']) ? esc_url_raw($value['backup_url']) : '',
                'enabled' => isset($value['enabled']) ? (bool)$value['enabled'] : false
            ];

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
            $existing = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}dbre_redirects   WHERE type = %s AND reference_id = %s",
                    array($type, $key)
                )
            );

            if ($existing) {
                $redirect_data['id'] = $existing->id;
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
                $wpdb->update(dbre_get_table_name(), $redirect_data, ['id' => $existing->id]);
                $saved_id = $existing->id;
            } else {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
                $wpdb->insert(dbre_get_table_name(), $redirect_data);
                $saved_id = $wpdb->insert_id;
            }

            // Build the query with escaped table name and prepare the ID
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
            $saved_entry = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}dbre_redirects  WHERE id = %d",
                    $saved_id
                ),
                ARRAY_A
            );
            
            if ($saved_entry) {
                $saved_entries[] = $saved_entry;
            }
        }

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
        $wpdb->query('COMMIT');
      
        // Clear Transients
        foreach ($settings as $key => $value) {
            if ($value['type'] === 'page') {
                delete_transient('dbre_redirect_' . $key);
            } else {
                delete_transient('dbre_custom_redirect_' . md5($key));
            }
        }

        wp_send_json_success([
            'message' => $deleted_count > 0 ? 
                        "Successfully deleted {$deleted_count} redirects" : 
                        'Settings saved successfully!',
            'type' => 'success',
            'entries' => $saved_entries,
            'deleted_count' => $deleted_count
        ]);
    } catch (Exception $e) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
        $wpdb->query('ROLLBACK');
        wp_send_json_error('Save failed: ' . $e->getMessage());
    }
}


// ===============================================
// Redirection Logic
// ===============================================
function dbre_redirect_logic() {
    try {
        $current_page_id = get_the_ID();
        $current_url = get_permalink($current_page_id);

        // Get cached redirect for this page
        $cache_key = 'dbre_redirect_' . $current_page_id;
        $redirect = get_transient($cache_key);

        if (false === $redirect) {
            global $wpdb;
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
            $redirect = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}dbre_redirects 
                    WHERE type = 'page' 
                    AND reference_id = %s 
                    AND enabled = 1",
                    $current_page_id
                ),
                ARRAY_A
            );
         
            set_transient($cache_key, $redirect, 3600);
        }

        if ($redirect && (!empty($redirect['ios_url']) || !empty($redirect['android_url']))) {
            // Get device type
            $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? 
                sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
            
            $is_ios = preg_match('/(ipad|iphone|ipod)/i', $user_agent);
            $is_android = preg_match('/android/i', $user_agent);
            
            $has_relevant_store_url = ($is_ios && !empty($redirect['ios_url'])) || 
                                    ($is_android && !empty($redirect['android_url']));

            if (($is_ios || $is_android) && $has_relevant_store_url) {
                // JavaScript config
                wp_enqueue_script(
                    'device-redirect-front',
                    plugins_url('js/redirect.js', __FILE__),
                    array(),
                    DBRE_VERSION,
                    true
                );

                $config = array(
                    'ios' => esc_url($redirect['ios_url']),
                    'android' => esc_url($redirect['android_url']),
                    'backup' => esc_url($redirect['backup_url']),
                    'current' => esc_url($current_url),
                    'isStoreUrl' => (
                        ($is_ios && !empty($redirect['ios_url']) && preg_match(DBRE_IOS_URL_PATTERN, $redirect['ios_url'])) ||
                        ($is_android && !empty($redirect['android_url']) && preg_match(DBRE_ANDROID_URL_PATTERN, $redirect['android_url']))
                    )
                );

                wp_localize_script('device-redirect-front', 'deviceRedirectConfig', $config);

                // Pass config to template
                add_filter('template_include', function($template) use ($config) {
                    // Make config available to template
                    global $deviceRedirectConfig;
                    $deviceRedirectConfig = $config;
                    return plugin_dir_path(__FILE__) . 'templates/redirect-template.php';
                }, 999);
            }
        }
    } catch (Exception $e) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            if (function_exists('wp_debug_log')) {
                wp_debug_log('Device Redirect Error: ' . $e->getMessage());
            }
        }
    }
}

// REST API endpoint for slug validation
add_action('rest_api_init', function () {
    register_rest_route('device-redirect/v1', '/validate-slug', array(
        'methods' => 'GET',
        'callback' => 'dbre_validate_slug',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'slug' => array(
                'required' => true,
                'type' => 'string',
            ),
        ),
    ));

    // REST API endpoint for paginated list
    register_rest_route('device-redirect/v1', '/redirects', array(
        'methods' => 'GET',
        'callback' => 'dbre_get_redirects_paginated',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'page' => array(
                'default' => 1,
                'sanitize_callback' => 'absint',
            ),
            'per_page' => array(
                'default' => 10,
                'sanitize_callback' => 'absint',
            ),
            'type' => array(
                'default' => 'all',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'search' => array(
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ),
            'reference_id' => array(
                'default' => '',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ));

    // REST API endpoint for deleting redirects
    register_rest_route('device-redirect/v1', '/delete', array(
        'methods' => 'POST',
        'callback' => 'dbre_handle_delete',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'items' => array(
                'required' => true,
                'type' => 'array',
                'items' => array(
                    'type' => 'object',
                    'properties' => array(
                        'id' => array('type' => 'integer'),
                        'type' => array('type' => 'string'),
                        'reference_id' => array('type' => 'string')
                    )
                )
            ),
        ),
    ));

    // REST API endpoint for getting a single entry
    register_rest_route('device-redirect/v1', '/entry', array(
        'methods' => 'GET',
        'callback' => 'dbre_get_entry',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'type' => array(
                'required' => true,
                'type' => 'string',
                'enum' => ['page', 'custom'],
            ),
            'reference_id' => array(
                'required' => true,
                'type' => 'string',
            ),
        ),
    ));
});

function dbre_validate_slug($request) {
    global $wpdb;
    
    $slug = strtolower(trim($request->get_param('slug')));
    
    // Check WordPress posts and pages
    $existing_content = get_page_by_path($slug, OBJECT, ['post', 'page']);
    if ($existing_content) {
        return new WP_Error(
            'slug_exists',
            'This slug is already used by a ' . $existing_content->post_type,
            ['status' => 400]
        );
    }
    
    // Check custom post types
    $custom_post_types = get_post_types(['public' => true, '_builtin' => false], 'names');
    foreach ($custom_post_types as $cpt) {
        $existing_cpt = get_page_by_path($slug, OBJECT, $cpt);
        if ($existing_cpt) {
            return new WP_Error(
                'slug_exists',
                'This slug is already used by a ' . $cpt,
                ['status' => 400]
            );
        }
    }
    

    // Check existing redirects
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
    $existing_redirect = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}dbre_redirects  WHERE type = 'custom' AND reference_id = %s",
            $slug
        )
    );
    
    if ($existing_redirect) {
        return new WP_Error(
            'slug_exists',
            'This slug is already used by a redirect',
            ['status' => 400]
        );
    }
    
    return ['available' => true];
}

function dbre_handle_slug_conflicts($slug, $post_ID, $post_status, $post_type, $post_parent, $original_slug) {
    global $wpdb;
    
    // Check if slug exists in redirects
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
    $existing = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}dbre_redirects 
            WHERE type = 'custom' AND reference_id = %s",
            $slug
        )
    );
    
    if ($existing) {
        $suffix = 1;
        do {
            $alt_slug = $original_slug . "-$suffix";
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
            $post_name_check = $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT post_name FROM $wpdb->posts 
                    WHERE post_name = %s AND ID != %d",
                    $alt_slug,
                    $post_ID
                )
            );
            $suffix++;
        } while ($post_name_check);
        
        return $alt_slug;
    }
    
    return $slug;
}

function dbre_handle_custom_slugs($wp) {
    global $wpdb;

    // Get current slug
    $request_path = isset($_SERVER['REQUEST_URI']) ? 
        trim(sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])), '/') : '';
    $site_path = wp_parse_url(site_url(), PHP_URL_PATH);
    $site_path = $site_path ? trim($site_path, '/') : '';
    
    $current_slug = '';
    if ($site_path && strpos($request_path, $site_path) === 0) {
        $current_slug = substr($request_path, strlen($site_path) + 1);
    } else {
        $current_slug = $request_path;
    }

    // Try to get from cache first
    $cache_key = 'dbre_custom_redirect_' . md5($current_slug);
    $redirect = get_transient($cache_key);
    
    if (false === $redirect) {
        global $wpdb;
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
        $redirect = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}dbre_redirects 
                WHERE type = 'custom' 
                AND reference_id = %s 
                AND enabled = 1",
                $current_slug
            ),
            ARRAY_A
        );
        
        // Cache for 1 hour
        set_transient($cache_key, $redirect, 3600);
    }

    if ($redirect) {
        // Get device type
        $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? 
            sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
        
        $is_ios = preg_match('/(ipad|iphone|ipod)/i', $user_agent);
        $is_android = preg_match('/android/i', $user_agent);
        
        $has_relevant_store_url = ($is_ios && !empty($redirect['ios_url'])) || 
                                ($is_android && !empty($redirect['android_url']));

        if (($is_ios || $is_android) && $has_relevant_store_url) {
            // JavaScript config
            wp_register_script(
                'device-redirect-front',
                plugins_url('js/redirect.js', __FILE__),
                array(),
                DBRE_VERSION,
                false
            );

            $config = array(
                'ios' => esc_url($redirect['ios_url']),
                'android' => esc_url($redirect['android_url']),
                'backup' => esc_url($redirect['backup_url']),
                'current' => esc_url(home_url(add_query_arg(NULL, NULL))),
                'isStoreUrl' => (
                    ($is_ios && !empty($redirect['ios_url']) && preg_match(DBRE_IOS_URL_PATTERN, $redirect['ios_url'])) ||
                    ($is_android && !empty($redirect['android_url']) && preg_match(DBRE_ANDROID_URL_PATTERN, $redirect['android_url']))
                )
            );

            wp_localize_script('device-redirect-front', 'deviceRedirectConfig', $config);
            wp_enqueue_script('device-redirect-front');

            // Pass config to template
            add_filter('template_include', function($template) use ($config) {
                // Make config available to template
                global $deviceRedirectConfig;
                $deviceRedirectConfig = $config;
                return plugin_dir_path(__FILE__) . 'templates/redirect-template.php';
            }, 999);
            
            return;
        }

        // For non-mobile or no relevant store URL
        if (!empty($redirect['backup_url'])) {
            wp_redirect(esc_url($redirect['backup_url']), 302);
            exit;
        } else {
            wp_redirect(home_url(), 302);
            exit;
        }
    }
}


function dbre_modify_redirect_canonical() {
    add_filter('redirect_canonical', 'dbre_prevent_old_slug_redirect', 10, 2);
}

function dbre_prevent_old_slug_redirect($redirect_url, $requested_url) {
    global $wpdb;
    
    $request_path = isset($_SERVER['REQUEST_URI']) ? 
        trim(sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])), '/') : '';
    $site_path = wp_parse_url(site_url(), PHP_URL_PATH);
    $site_path = $site_path ? trim($site_path, '/') : '';
    
    $current_slug = '';
    if ($site_path && strpos($request_path, $site_path) === 0) {
        $current_slug = substr($request_path, strlen($site_path) + 1);
    } else {
        $current_slug = $request_path;
    }

    // Remove query strings
    $current_slug = strtok($current_slug, '?');

    // Check if slug exists in redirects
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
    $exists = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}dbre_redirects 
            WHERE type = 'custom' 
            AND reference_id = %s 
            AND enabled = 1",
            $current_slug
        )
    );
    
    return $exists ? false : $redirect_url;
}

// Migration function
function dbre_run_migration() {
    global $wpdb;
    
    // Check if migration is needed by looking at both the migration flag
    // and checking if the old data exists
    if (get_option('dbre_migration_complete') && !get_option(DBRE_SETTINGS_KEY)) {
        return;
    }

    // Get old data from wp_options
    $old_settings = get_option(DBRE_SETTINGS_KEY, []);
    
    if (!empty($old_settings)) {
        // Start transaction for safety
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query('START TRANSACTION');
        
        try {
            foreach ($old_settings as $key => $value) {
                $post = get_post($key);
                $type = $post ? 'page' : 'custom';
                $reference_id = $key;

                // Check if entry already exists
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                $existing = $wpdb->get_var(
                    $wpdb->prepare(
                        "SELECT id FROM {$wpdb->prefix}dbre_redirects 
                        WHERE type = %s AND reference_id = %s",
                        $type,
                        $reference_id
                    )
                );

                if (!$existing) {
                    // Only insert if entry doesn't exist
                    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
                    $wpdb->insert(
                        dbre_get_table_name(),
                        [
                            'type' => $type,
                            'reference_id' => $reference_id,
                            'title' => $value['title'] ?? null,
                            'ios_url' => $value['ios_url'] ?? null,
                            'android_url' => $value['android_url'] ?? null,
                            'backup_url' => $value['backup_url'] ?? null,
                            'enabled' => !empty($value['enabled']) ? 1 : 0,
                            'created_at' => current_time('mysql'),
                            'updated_at' => current_time('mysql'),
                            'order' => 0
                        ],
                        [
                            '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%d'
                        ]
                    );

                    if ($wpdb->last_error) {
                        throw new Exception($wpdb->last_error);
                    }
                }
            }
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query('COMMIT');
            
            // Mark migration as complete
            update_option('dbre_migration_complete', true);
            
            // Optionally, backup old data with timestamp
            // $backup_key = 'dbre_old_settings_backup_' . time();
            // update_option($backup_key, $old_settings);
            
            // Delete old option after successful migration and backup
            delete_option(DBRE_SETTINGS_KEY);
            
        } catch (Exception $e) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query('ROLLBACK');
            
            // Log error if debug is enabled
            if (defined('WP_DEBUG') && WP_DEBUG) {
                if (function_exists('wp_debug_log')) {
                    wp_debug_log('Device Redirect Migration Error: ' . $e->getMessage());
                }
            }
        }
    }
}

// DB helper functions - Used for Clearing Transients during Deactivation
function dbre_get_redirects() {
    global $wpdb;
        
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Required for atomic transactions, caching handled at entry points
    $results = $wpdb->get_results(
        "SELECT * FROM {$wpdb->prefix}dbre_redirects  ORDER BY `order` ASC",
        ARRAY_A
    );

    return $results ?: [];
}

function dbre_get_table_name() {
    global $wpdb;
    return $wpdb->prefix . 'dbre_redirects';
}

function dbre_get_redirects_paginated($request) {
    global $wpdb;
    $page = $request->get_param('page');
    $per_page = $request->get_param('per_page');
    $type = $request->get_param('type');
    $reference_id = $request->get_param('reference_id');

    $offset = ($page - 1) * $per_page;
    
    if ($type && $type !== 'all') {
        // Query with type filter
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $total_items = (int)$wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}dbre_redirects WHERE type = %s",
                $type
            )
        );
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}dbre_redirects WHERE type = %s ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $type, $per_page, $offset
            ),
            ARRAY_A
        );
    } elseif ($reference_id !== '') {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $total_items = (int)$wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}dbre_redirects WHERE reference_id = %s",
                $reference_id
            )
        );
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}dbre_redirects WHERE reference_id = %s ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $reference_id, $per_page, $offset
            ),
            ARRAY_A
        );
    } else {
        // No type filter, get all records
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $total_items = (int)$wpdb->get_var(
            "SELECT COUNT(*) FROM {$wpdb->prefix}dbre_redirects"
        );
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $results = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}dbre_redirects ORDER BY created_at DESC LIMIT %d OFFSET %d",
                $per_page, $offset
            ),
            ARRAY_A
        );
    }
    
    // Format results for frontend
    $formatted_results = array_map(function($item) {
        $formatted = [
            'id' => (int)$item['id'],
            'type' => $item['type'],
            'reference_id' => $item['reference_id'],
            'title' => $item['title'],
            'iosUrl' => $item['ios_url'],
            'androidUrl' => $item['android_url'],
            'backupUrl' => $item['backup_url'],
            'enabled' => (bool)$item['enabled'],
            'updatedAt' => $item['updated_at']
        ];

        if ($item['type'] === 'page') {
            $page = get_post($item['reference_id']);
            $formatted['displayTitle'] = $page ? $page->post_title : $item['reference_id'];
            $formatted['displayUrl'] = $page ? get_permalink($page->ID) : home_url($item['reference_id']);
        } else {
            $formatted['displayTitle'] = $item['title'] ?: $item['reference_id'];
            $formatted['displayUrl'] = home_url($item['reference_id']);
        }

        return $formatted;
    }, $results ?: []);

    $total_pages = ceil($total_items / $per_page);

    return new WP_REST_Response([
        'items' => $formatted_results,
        'total' => $total_items,
        'pages' => $total_pages
    ], 200);
}

// Function to handle delete requests
function dbre_handle_delete($request) {
    global $wpdb;
    $items = $request->get_param('items');
    
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
    $wpdb->query('START TRANSACTION');
    
    try {
        $deleted_count = 0;
        foreach ($items as $item) {
            // Delete using ID
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $result = $wpdb->delete(
                dbre_get_table_name(),
                ['id' => $item['id']],
                ['%d']
            );

            if ($result) {
                // Clear transients based on type from request
                if ($item['type'] === 'page') {
                    delete_transient('dbre_redirect_' . $item['reference_id']);
                } else {
                    delete_transient('dbre_custom_redirect_' . md5($item['reference_id']));
                }
                $deleted_count++;
            }
        }
        
        if ($deleted_count === count($items)) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
            $wpdb->query('COMMIT');
            return new WP_REST_Response([
                'success' => true,
                'message' => sprintf('%d redirect(s) deleted successfully', $deleted_count)
            ], 200);
        } else {
            throw new Exception('Some redirects could not be deleted');
        }
    } catch (Exception $e) {
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query('ROLLBACK');
        return new WP_Error(
            'delete_failed',
            $e->getMessage(),
            array('status' => 500)
        );
    }
}

// Function to get Redirect Entry by Type and Reference ID
function dbre_get_entry($request) {
    global $wpdb;
    
    $type = sanitize_text_field($request->get_param('type'));
    $reference_id = sanitize_text_field($request->get_param('reference_id'));
    
    // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
    $entry = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}dbre_redirects WHERE type = %s AND reference_id = %s",
            $type,
            $reference_id
        ),
        ARRAY_A
    );
    
    if (!$entry) {
        return new WP_REST_Response([
            'exists' => false,
            'message' => 'Entry not found'
        ], 200);
    }
    
    // Format the entry similar to the list endpoint
    $formatted = [
        'id' => (int)$entry['id'],
        'type' => $entry['type'],
        'reference_id' => $entry['reference_id'],
        'title' => $entry['title'],
        'iosUrl' => $entry['ios_url'],
        'androidUrl' => $entry['android_url'],
        'backupUrl' => $entry['backup_url'],
        'enabled' => (bool)$entry['enabled'],
        'updatedAt' => $entry['updated_at']
    ];
    
    if ($entry['type'] === 'page') {
        $page = get_post($entry['reference_id']);
        $formatted['displayTitle'] = $page ? $page->post_title : $entry['reference_id'];
        $formatted['displayUrl'] = $page ? get_permalink($page->ID) : home_url($entry['reference_id']);
    } else {
        $formatted['displayTitle'] = $entry['title'] ?: $entry['reference_id'];
        $formatted['displayUrl'] = home_url($entry['reference_id']);
    }
    
    return new WP_REST_Response([
        'exists' => true,
        'entry' => $formatted
    ], 200);
}


// Function to handle the plugin action links
function dbre_add_plugin_action_links($links) {
    // Settings link - Update the URL to point to the new location
    $settings_link = sprintf(
        '<a href="%s">%s</a>',
        admin_url('admin.php?page=device-redirects'),  // Updated URL
        __('Settings', 'device-based-redirect')
    );
    array_unshift($links, $settings_link);
    
    // Support link
    $support_link = sprintf(
        '<a href="%s">%s</a>',
        'https://wordpress.org/support/plugin/device-based-redirect/',
        __('Support', 'device-based-redirect')
    );
    array_push($links, $support_link);
    
    return $links;
}

function dbre_handle_dismiss_review() {
    check_ajax_referer('device_redirect_nonce', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error(array(
            'message' => 'Unauthorized'
        ), 403);
        return;
    }
    
    // First try to delete any existing option
    delete_option('dbre_review_dismissed');
    
    // Then add the new option
    $result = add_option('dbre_review_dismissed', 1);
    
    if (!$result) {
        // If add_option failed, try update_option
        $result = update_option('dbre_review_dismissed', 1);
    }
    
    if ($result) {
        wp_send_json_success(array(
            'message' => 'Review request dismissed successfully'
        ));
    } else {
        wp_send_json_error(array(
            'message' => 'Failed to update dismissal status'
        ), 500);
    }
}
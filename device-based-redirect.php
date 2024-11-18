<?php
/*
Plugin Name: Device Based Redirect
Plugin URI:  https://github.com/ncherian/device-based-redirect
Description: A plugin that redirects users to the App Store or Google Play Store based on their device type (iOS/Android), with options to select the page and set URLs in the admin dashboard.
Version:     1.0.0
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

register_activation_hook(__FILE__, 'dbre_activate');
register_deactivation_hook(__FILE__, 'dbre_deactivate');

function dbre_activate() {
    global $wpdb;
    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

    // Create redirects table
    $redirects_sql = "CREATE TABLE IF NOT EXISTS " . dbre_get_table_name() . " (
        `id` bigint(20) NOT NULL AUTO_INCREMENT,
        `type` enum('page', 'custom') NOT NULL,
        `reference_id` varchar(191) DEFAULT NULL,
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

    // Run migration if needed
    dbre_run_migration();

    // Store current DB version
    update_option('dbre_db_version', DBRE_DB_VERSION);
}

function dbre_deactivate() {
    // Deactivation code
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


// define('DEVICE_REDIRECT_MINIMUM_WP_VERSION', '5.0');
// define('DEVICE_REDIRECT_MINIMUM_PHP_VERSION', '7.2');
// URL pattern constants
define('DBRE_VERSION', '1.0.0');
define('DBRE_IOS_URL_PATTERN', '/^https:\/\/apps\.apple\.com/');
define('DBRE_ANDROID_URL_PATTERN', '/^https:\/\/play\.google\.com/');
// Option names
define('DBRE_SETTINGS_KEY', 'dbre_entries');
define('DBRE_DB_VERSION', '1.0');

// Validation helper class
class DBRE_Validator {
    public static function is_valid_store_url($url, $type) {
        if (empty($url)) {
            return false;
        }

        $url = esc_url_raw($url);

        switch ($type) {
            case 'ios':
                return (bool) preg_match(DBRE_IOS_URL_PATTERN, $url);
            case 'android':
                return (bool) preg_match(DBRE_ANDROID_URL_PATTERN, $url);
            default:
                return false;
        }
    }

    public static function sanitize_settings($settings) {
        if (!is_array($settings)) {
            return [];
        }

        $sanitized = [];
        foreach ($settings as $key => $value) {
            if (!is_array($value)) {
                continue;
            }

            $safe_key = sanitize_text_field($key);
            $sanitized[$safe_key] = [
                'ios_url' => self::sanitize_store_url($value['ios_url'] ?? '', 'ios'),
                'android_url' => self::sanitize_store_url($value['android_url'] ?? '', 'android'),
                'backup_url' => isset($value['backup_url']) ? esc_url_raw($value['backup_url']) : '',
                'enabled' => isset($value['enabled']) ? (bool)$value['enabled'] : false
            ];
        }

        return $sanitized;
    }

    private static function sanitize_store_url($url, $type) {
        $url = esc_url_raw($url);
        return self::is_valid_store_url($url, $type) ? $url : '';
    }
}

function dbre_menu() {
    add_options_page(
        'Device Based Redirection Settings',
        'Device Redirects',
        'manage_options',
        'device-redirects',
        'dbre_settings_page'
    );
}

function dbre_settings_page() {
    echo '<div id="device-redirect-settings"></div>';
}

function dbre_scripts($hook) {
    if ($hook !== 'settings_page_device-redirects') {
        return;
    }

    wp_enqueue_script(
        'device-redirect-react',
        plugins_url('build/index.js', __FILE__),
        ['wp-element'],
        filemtime(plugin_dir_path(__FILE__) . 'build/index.js'),
        true
    );

    // Get all redirects from the new DB structure
    $redirects = dbre_get_redirects();
    
    // Debug output
    error_log('Raw redirects from DB: ' . print_r($redirects, true));
    
    // Format redirects for the frontend
    $formatted_redirects = [];
    foreach ($redirects as $redirect) {
        $key = $redirect['reference_id'];
        $formatted_redirects[$key] = [
            'id' => (int)$redirect['id'],
            'type' => $redirect['type'],
            'reference_id' => $redirect['reference_id'],
            'iosUrl' => $redirect['ios_url'],
            'androidUrl' => $redirect['android_url'],
            'backupUrl' => $redirect['backup_url'],
            'enabled' => (bool)$redirect['enabled'],
            'created_at' => $redirect['created_at'],
            'updated_at' => $redirect['updated_at'],
            'order' => (int)$redirect['order']
        ];
    }

    // Debug output
    error_log('Formatted redirects: ' . print_r($formatted_redirects, true));

    // Get all pages for the dropdown
    $all_pages = get_pages();
    $formatted_pages = array_map(function($page) {
        return [
            'value' => (string)$page->ID,
            'label' => $page->post_title,
            'slug' => $page->post_name
        ];
    }, $all_pages);

    wp_localize_script('device-redirect-react', 'deviceRedirectData', [
        'nonce' => wp_create_nonce('device_redirect_nonce'),
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'restUrl' => rest_url(),
        'restNonce' => wp_create_nonce('wp_rest'),
        'homeUrl' => home_url(),
        'pages' => $formatted_pages,
        'settings' => $formatted_redirects,
        'pluginUrl' => plugins_url('', __FILE__),
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
    $wpdb->query('START TRANSACTION');

    try {
        $saved_entries = [];
        $deleted_count = 0;

        foreach ($settings as $key => $value) {
            // Log the current operation
            error_log("Processing setting for key: {$key}");
            error_log("Value: " . var_export($value, true));

            // If value is null, delete the redirect
            if ($value === null) {
                $delete_result = dbre_delete_redirect($key);
                if (!$delete_result) {
                    throw new Exception("Failed to delete redirect with reference_id: {$key}");
                }
                $deleted_count++;
                continue;
            }

            $type = is_numeric($key) ? 'page' : 'custom';
            
            $redirect_data = [
                'type' => $type,
                'reference_id' => $key,
                'ios_url' => isset($value['ios_url']) ? esc_url_raw($value['ios_url']) : '',
                'android_url' => isset($value['android_url']) ? esc_url_raw($value['android_url']) : '',
                'backup_url' => isset($value['backup_url']) ? esc_url_raw($value['backup_url']) : '',
                'enabled' => isset($value['enabled']) ? (bool)$value['enabled'] : false
            ];

            $existing = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT id FROM " . dbre_get_table_name() . " WHERE type = %s AND reference_id = %s",
                    $type,
                    $key
                )
            );

            if ($existing) {
                $redirect_data['id'] = $existing->id;
                $wpdb->update(dbre_get_table_name(), $redirect_data, ['id' => $existing->id]);
                $saved_id = $existing->id;
            } else {
                $wpdb->insert(dbre_get_table_name(), $redirect_data);
                $saved_id = $wpdb->insert_id;
            }

            // Get the complete saved entry
            $saved_entry = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT * FROM " . dbre_get_table_name() . " WHERE id = %d",
                    $saved_id
                ),
                ARRAY_A
            );
            
            if ($saved_entry) {
                $saved_entries[] = $saved_entry;
            }
        }

        $wpdb->query('COMMIT');

        wp_send_json_success([
            'message' => $deleted_count > 0 ? 
                        "Successfully deleted {$deleted_count} redirects" : 
                        'Settings saved successfully!',
            'type' => 'success',
            'entries' => $saved_entries,
            'deleted_count' => $deleted_count
        ]);
    } catch (Exception $e) {
        $wpdb->query('ROLLBACK');
        error_log("Error in dbre_save_settings: " . $e->getMessage());
        wp_send_json_error('Save failed: ' . $e->getMessage());
    }
}


// ===============================================
// Redirection Logic
// ===============================================
function dbre_redirect_logic() {
    try {
        global $wpdb;
        $current_page_id = get_the_ID();
        $current_url = home_url(add_query_arg(NULL, NULL));

        // Get page redirect if exists
        $redirect = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM " . dbre_get_table_name() . " 
                WHERE type = 'page' 
                AND reference_id = %s 
                AND enabled = 1",
                $current_page_id
            ),
            ARRAY_A
        );

        if ($redirect && (!empty($redirect['ios_url']) || !empty($redirect['android_url']))) {
            // Enqueue the redirect script
            wp_enqueue_script(
                'device-redirect-front',
                plugins_url('js/redirect.js', __FILE__),
                array(),
                DBRE_VERSION,
                true
            );

            // Pass configuration to script
            wp_localize_script(
                'device-redirect-front',
                'deviceRedirectConfig',
                array(
                    'ios' => esc_js($redirect['ios_url']),
                    'android' => esc_js($redirect['android_url']),
                    'backup' => esc_js($redirect['backup_url']),
                    'current' => esc_js($current_url)
                )
            );
        }
    } catch (Exception $e) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Device Redirect Error: ' . $e->getMessage());
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

    // New bulk operations endpoint
    register_rest_route('device-redirect/v1', '/bulk-action', array(
        'methods' => 'POST',
        'callback' => 'dbre_handle_bulk_action',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'action' => array(
                'required' => true,
                'type' => 'string',
                'enum' => ['delete', 'enable', 'disable'],
            ),
            'ids' => array(
                'required' => true,
                'type' => 'array',
                'items' => array(
                    'type' => ['integer', 'string']
                ),
            ),
        ),
    ));

    // Add new REST API endpoint for paginated list
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

    // Add this to the rest_api_init action
    register_rest_route('device-redirect/v1', '/delete', array(
        'methods' => 'POST',
        'callback' => 'dbre_handle_delete',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
        'args' => array(
            'reference_ids' => array(
                'required' => true,
                'type' => 'array',
                'items' => array(
                    'type' => 'string'
                ),
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
    $existing_redirect = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM " . dbre_get_table_name() . " WHERE type = 'custom' AND reference_id = %s",
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
    $existing = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM " . dbre_get_table_name() . " 
            WHERE type = 'custom' AND reference_id = %s",
            $slug
        )
    );
    
    if ($existing) {
        $suffix = 1;
        do {
            $alt_slug = $original_slug . "-$suffix";
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

    // Get custom redirect if exists
    $redirect = $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM " . dbre_get_table_name() . " 
            WHERE type = 'custom' 
            AND reference_id = %s 
            AND enabled = 1",
            $current_slug
        ),
        ARRAY_A
    );

    if ($redirect) {
        // Get device type
        $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? 
            sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
        
        $is_ios = preg_match('/(ipad|iphone|ipod)/i', $user_agent);
        $is_android = preg_match('/android/i', $user_agent);
        
        $has_relevant_store_url = ($is_ios && !empty($redirect['ios_url'])) || 
                                ($is_android && !empty($redirect['android_url']));

        if (($is_ios || $is_android) && $has_relevant_store_url) {
            wp_register_script(
                'device-redirect-front',
                plugins_url('js/redirect.js', __FILE__),
                array(),
                DBRE_VERSION,
                false
            );

            wp_localize_script(
                'device-redirect-front',
                'deviceRedirectConfig',
                array(
                    'ios' => esc_url($redirect['ios_url']),
                    'android' => esc_url($redirect['android_url']),
                    'backup' => esc_url($redirect['backup_url']),
                    'current' => esc_url(home_url(add_query_arg(NULL, NULL)))
                )
            );

            wp_enqueue_script('device-redirect-front');

            add_filter('template_include', function($template) {
                return plugin_dir_path(__FILE__) . 'templates/redirect-template.php';
            }, 999);
            
            return;
        }

        // For non-mobile or no relevant store URL
        if (!empty($redirect['backup_url'])) {
            wp_redirect(esc_url($redirect['backup_url']));
            exit;
        } else {
            wp_redirect(home_url());
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
    $exists = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM " . dbre_get_table_name() . " 
            WHERE type = 'custom' 
            AND reference_id = %s 
            AND enabled = 1",
            $current_slug
        )
    );
    
    return $exists ? false : $redirect_url;
}

// Add migration function
function dbre_run_migration() {
    global $wpdb;
    
    // Check if migration is needed
    if (get_option('dbre_migration_complete')) {
        return;
    }

    // Get old data from wp_options
    $old_settings = get_option(DBRE_SETTINGS_KEY, []);
    
    if (!empty($old_settings)) {
        foreach ($old_settings as $key => $value) {
            $type = is_numeric($key) ? 'page' : 'custom';
            $reference_id = $key;

            // Insert into new table
            $wpdb->insert(
                dbre_get_table_name(),
                [
                    'type' => $type,
                    'reference_id' => $reference_id,
                    'ios_url' => $value['ios_url'] ?? null,
                    'android_url' => $value['android_url'] ?? null,
                    'backup_url' => $value['backup_url'] ?? null,
                    'enabled' => !empty($value['enabled']) ? 1 : 0,
                    'created_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql'),
                    'order' => 0
                ],
                [
                    '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%d'
                ]
            );
        }
    }

    // Mark migration as complete
    update_option('dbre_migration_complete', true);
    
    // Optionally, delete old option (you might want to keep it for backup)
    // delete_option(DBRE_SETTINGS_KEY);
}

// Add new DB helper functions
function dbre_get_redirects() {
    global $wpdb;
    
    $results = $wpdb->get_results(
        "SELECT * FROM " . dbre_get_table_name() . " ORDER BY `order` ASC",
        ARRAY_A
    );
    
    // Debug output
    error_log('SQL Query: ' . $wpdb->last_query);
    error_log('SQL Result: ' . print_r($results, true));
    
    return $results ?: [];
}

function dbre_get_redirect($id) {
    global $wpdb;
    
    return $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM " . dbre_get_table_name() . " WHERE id = %d",
            $id
        ),
        ARRAY_A
    );
}

function dbre_save_redirect($data) {
    global $wpdb;
    
    $data['updated_at'] = current_time('mysql');
    
    if (!empty($data['id'])) {
        // Update
        $wpdb->update(
            dbre_get_table_name(),
            $data,
            ['id' => $data['id']]
        );
        return $data['id'];
    } else {
        // Insert
        $data['created_at'] = current_time('mysql');
        $wpdb->insert(dbre_get_table_name(), $data);
        return $wpdb->insert_id;
    }
}

// Add the bulk action handler
function dbre_handle_bulk_action($request) {
    global $wpdb;
    
    $action = $request->get_param('action');
    $ids = $request->get_param('ids');
    
    if (empty($ids)) {
        return new WP_Error(
            'no_items',
            'No items selected',
            ['status' => 400]
        );
    }

    // Sanitize IDs - ensure they're all integers
    $ids = array_map(function($id) {
        return absint(strval($id));
    }, $ids);

    // Remove any zero values that might result from invalid IDs
    $ids = array_filter($ids);

    if (empty($ids)) {
        return new WP_Error(
            'invalid_ids',
            'No valid IDs provided',
            ['status' => 400]
        );
    }

    switch ($action) {
        case 'delete':
            $result = $wpdb->query(
                $wpdb->prepare(
                    "DELETE FROM " . dbre_get_table_name() . " 
                    WHERE id IN (" . implode(',', array_fill(0, count($ids), '%d')) . ")",
                    $ids
                )
            );
            $message = 'Redirects deleted successfully';
            break;

        case 'enable':
        case 'disable':
            $enabled = $action === 'enable' ? 1 : 0;
            $result = $wpdb->query(
                $wpdb->prepare(
                    "UPDATE " . dbre_get_table_name() . " 
                    SET enabled = %d 
                    WHERE id IN (" . implode(',', array_fill(0, count($ids), '%d')) . ")",
                    array_merge([$enabled], $ids)
                )
            );
            $message = 'Redirects ' . $action . 'd successfully';
            break;

        default:
            return new WP_Error(
                'invalid_action',
                'Invalid action specified',
                ['status' => 400]
            );
    }

    if ($result === false) {
        return new WP_Error(
            'db_error',
            'Database operation failed',
            ['status' => 500]
        );
    }

    // Get updated entries
    $updated_entries = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT * FROM " . dbre_get_table_name() . " 
            WHERE id IN (" . implode(',', array_fill(0, count($ids), '%d')) . ")",
            $ids
        ),
        ARRAY_A
    );

    return [
        'success' => true,
        'message' => $message,
        'affected' => $result,
        'entries' => $updated_entries
    ];
}

// Add a function to get redirect by ID or reference
function dbre_get_redirect_by_reference($type, $reference_id) {
    global $wpdb;
    
    return $wpdb->get_row(
        $wpdb->prepare(
            "SELECT * FROM " . dbre_get_table_name() . " 
            WHERE type = %s AND reference_id = %s",
            $type,
            $reference_id
        ),
        ARRAY_A
    );
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
    $search = $request->get_param('search');
    $reference_id = $request->get_param('reference_id');
    $id = $request->get_param('id');
    
    $offset = ($page - 1) * $per_page;
    
    // Build query
    $where_clauses = array('1=1');
    $where_values = array();
    
    // Add ID check
    if ($id) {
        $where_clauses[] = 'id = %d';
        $where_values[] = $id;
    }
    
    // Make type check more explicit
    if ($type && $type !== 'all') {
        $where_clauses[] = 'type = %s';
        $where_values[] = $type;
    }
    
    // Make reference_id check more explicit
    if ($reference_id !== '') {
        $where_clauses[] = 'reference_id = %s';
        $where_values[] = $reference_id;
    }
    
    if ($search !== '') {
        $where_clauses[] = '(reference_id LIKE %s OR ios_url LIKE %s OR android_url LIKE %s OR backup_url LIKE %s)';
        $search_term = '%' . $wpdb->esc_like($search) . '%';
        $where_values = array_merge($where_values, array($search_term, $search_term, $search_term, $search_term));
    }
    
    // Get total count
    $count_query = "SELECT COUNT(*) FROM " . dbre_get_table_name() . " WHERE " . implode(' AND ', $where_clauses);
    $total_items = (int)$wpdb->get_var($wpdb->prepare($count_query, $where_values));
    
    // Get paginated results
    $query = "SELECT * FROM " . dbre_get_table_name() . " 
              WHERE " . implode(' AND ', $where_clauses) . "
              ORDER BY created_at DESC 
              LIMIT %d OFFSET %d";
    
    $prepared_values = array_merge($where_values, array($per_page, $offset));
    $results = $wpdb->get_results($wpdb->prepare($query, $prepared_values), ARRAY_A);
    
    // Format results for frontend
    $formatted_results = array_map(function($item) {
        $formatted = [
            'id' => (int)$item['id'],
            'type' => $item['type'],
            'reference_id' => $item['reference_id'],
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
            $formatted['displayTitle'] = $item['reference_id'];
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

// Add this function to properly handle deletion
function dbre_delete_redirect($reference_id) {
    global $wpdb;
    
    // Delete the redirect using reference_id
    $result = $wpdb->delete(
        dbre_get_table_name(),
        ['reference_id' => $reference_id],
        ['%s']
    );

    // Log deletion attempt for debugging
    error_log("Attempting to delete redirect with reference_id: {$reference_id}");
    error_log("Delete result: " . var_export($result, true));
    error_log("Last SQL query: {$wpdb->last_query}");

    return $result !== false;
}

// Add this function to handle delete requests
function dbre_handle_delete($request) {
    global $wpdb;
    $reference_ids = $request->get_param('reference_ids');
    
    $wpdb->query('START TRANSACTION');
    
    try {
        $deleted_count = 0;
        foreach ($reference_ids as $reference_id) {
            $result = dbre_delete_redirect($reference_id);
            if ($result) {
                $deleted_count++;
            }
        }
        
        if ($deleted_count === count($reference_ids)) {
            $wpdb->query('COMMIT');
            return new WP_REST_Response([
                'success' => true,
                'message' => sprintf('%d redirect(s) deleted successfully', $deleted_count)
            ], 200);
        } else {
            throw new Exception('Some redirects could not be deleted');
        }
    } catch (Exception $e) {
        $wpdb->query('ROLLBACK');
        return new WP_Error(
            'delete_failed',
            $e->getMessage(),
            array('status' => 500)
        );
    }
}

<?php
/*
Plugin Name: Device Based Redirect
Plugin URI:  https://github.com/ncherian/device-based-redirect
Description: A plugin that redirects users to the App Store or Google Play Store based on their device type (iOS/Android), with options to select the page and set URLs in the admin dashboard.
Version:     1.0.0
Author:      Nithin Paul Cherian
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

register_activation_hook(__FILE__, 'device_based_redirect_activate');
register_deactivation_hook(__FILE__, 'device_based_redirect_deactivate');

function device_based_redirect_activate() {
    // Initialize plugin options if they don't exist
    if (false === get_option(DEVICE_REDIRECT_ENABLED_KEY)) {
        add_option(DEVICE_REDIRECT_ENABLED_KEY, false);
    }
    if (false === get_option(DEVICE_REDIRECT_SETTINGS_KEY)) {
        add_option(DEVICE_REDIRECT_SETTINGS_KEY, []);
    }
}

function device_based_redirect_deactivate() {
    // delete_option(DEVICE_REDIRECT_ENABLED_KEY);
    // delete_option(DEVICE_REDIRECT_SETTINGS_KEY);
}

// ===============================================
// Admin UI Setup (React Integration)
// ===============================================

add_action('admin_menu', 'device_based_redirect_menu');
add_action('admin_enqueue_scripts', 'device_based_redirect_scripts');
add_action('template_redirect', 'device_based_redirect_logic');
add_action('wp_ajax_save_device_redirect_settings', 'save_device_redirect_settings'); // Register the AJAX handler

add_filter('wp_unique_post_slug', 'handle_redirect_slug_conflicts', 10, 6);


// define('DEVICE_REDIRECT_VERSION', '1.0.0');
// define('DEVICE_REDIRECT_MINIMUM_WP_VERSION', '5.0');
// define('DEVICE_REDIRECT_MINIMUM_PHP_VERSION', '7.2');
// URL pattern constants
define('DEVICE_REDIRECT_IOS_URL_PATTERN', '/^https:\/\/apps\.apple\.com/');
define('DEVICE_REDIRECT_ANDROID_URL_PATTERN', '/^https:\/\/play\.google\.com/');
// Option names
define('DEVICE_REDIRECT_SETTINGS_KEY', 'device_redirect_entries');
define('DEVICE_REDIRECT_ENABLED_KEY', 'device_redirect_enabled');

// Validation helper class
class Device_Redirect_Validator {
    public static function is_valid_store_url($url, $type) {
        if (empty($url)) {
            return false;
        }

        $url = esc_url_raw($url);

        switch ($type) {
            case 'ios':
                return (bool) preg_match(DEVICE_REDIRECT_IOS_URL_PATTERN, $url);
            case 'android':
                return (bool) preg_match(DEVICE_REDIRECT_ANDROID_URL_PATTERN, $url);
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

function device_based_redirect_menu() {
    add_options_page(
        'Device Based Redirection Settings',
        'Device Redirects',
        'manage_options',
        'device-redirects',
        'device_based_redirect_settings'
    );
}

function device_based_redirect_scripts($hook) {
    // Only load on our plugin's page
    if ($hook !== 'settings_page_device-redirects') {
        return;
    }

    // Enqueue React and our plugin's scripts
    wp_enqueue_script(
        'device-redirect-react',
        plugins_url('build/index.js', __FILE__),
        ['wp-element'],
        filemtime(plugin_dir_path(__FILE__) . 'build/index.js'),
        true
    );

    // Get all saved settings
    $saved_settings = get_option(DEVICE_REDIRECT_SETTINGS_KEY, []);
    
    // Ensure we're passing a proper array
    if (!is_array($saved_settings)) {
        $saved_settings = [];
    }

    // Get all pages for the dropdown
    $all_pages = get_pages();
    $formatted_pages = array_map(function($page) {
        return [
            'value' => (string)$page->ID, // Convert to string to ensure consistent comparison
            'label' => $page->post_title
        ];
    }, $all_pages);

    // Pass data to JavaScript
    wp_localize_script('device-redirect-react', 'deviceRedirectData', [
        'nonce' => wp_create_nonce('device_redirect_nonce'),
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'restUrl' => rest_url(),
        'restNonce' => wp_create_nonce('wp_rest'),
        'homeUrl' => home_url(),
        'pages' => $formatted_pages,
        'settings' => $saved_settings,
        'globalEnabled' => get_option(DEVICE_REDIRECT_ENABLED_KEY, false),
        'pluginUrl' => plugins_url('', __FILE__),
    ]);
}

function device_based_redirect_settings() {
    echo '<div id="device-redirect-settings"></div>';
}

function save_device_redirect_settings() {
    check_ajax_referer('device_redirect_nonce', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error('Unauthorized', 403);
    }

    // Validate that settings exist in POST data
    if (!isset($_POST['settings'])) {
        wp_send_json_error('No settings data provided', 400);
    }

    // Unslash and decode JSON data
    $raw_settings = sanitize_text_field(wp_unslash($_POST['settings']));
    $settings = json_decode($raw_settings, true);

    // Validate JSON decode
    if (json_last_error() !== JSON_ERROR_NONE) {
        wp_send_json_error('Invalid JSON data', 400);
    }

    // Validate settings is an array
    if (!is_array($settings)) {
        wp_send_json_error('Invalid settings format', 400);
    }

    // Sanitize settings
    $sanitized_settings = [];
    foreach ($settings as $key => $value) {
        // Sanitize the key
        $safe_key = sanitize_text_field($key);
        
        if (!is_array($value)) {
            continue;
        }

        // Sanitize each setting's values
        $sanitized_settings[$safe_key] = [
            'ios_url' => isset($value['ios_url']) ? esc_url_raw($value['ios_url']) : '',
            'android_url' => isset($value['android_url']) ? esc_url_raw($value['android_url']) : '',
            'backup_url' => isset($value['backup_url']) ? esc_url_raw($value['backup_url']) : '',
            'enabled' => isset($value['enabled']) ? (bool)$value['enabled'] : false
        ];

        // Additional validation for URLs
        if (!empty($sanitized_settings[$safe_key]['ios_url']) && 
            !preg_match('/^https:\/\/apps\.apple\.com/', $sanitized_settings[$safe_key]['ios_url'])) {
            $sanitized_settings[$safe_key]['ios_url'] = '';
        }

        if (!empty($sanitized_settings[$safe_key]['android_url']) && 
            !preg_match('/^https:\/\/play\.google\.com/', $sanitized_settings[$safe_key]['android_url'])) {
            $sanitized_settings[$safe_key]['android_url'] = '';
        }
    }

    // Sanitize global enabled setting
    $global_enabled = isset($_POST['globalEnabled']) ? 
        rest_sanitize_boolean(sanitize_text_field(wp_unslash($_POST['globalEnabled']))) : 
        false;

    // Save the sanitized settings
    update_option(DEVICE_REDIRECT_SETTINGS_KEY, $sanitized_settings);
    update_option(DEVICE_REDIRECT_ENABLED_KEY, $global_enabled);

    wp_send_json_success([
        'message' => 'Settings saved successfully!',
        'type' => 'success',
        'settings' => $sanitized_settings
    ]);
}


// ===============================================
// Redirection Logic
// ===============================================
function device_based_redirect_logic() {
    try {
        // Check if redirection is globally enabled
        if (!get_option(DEVICE_REDIRECT_ENABLED_KEY)) {
            return;
        }

        // Get the redirection settings for pages and slugs
        $redirect_pages = get_option(DEVICE_REDIRECT_SETTINGS_KEY, []);
        if (empty($redirect_pages) || !is_array($redirect_pages)) {
            return;
        }

        $current_page_id = get_the_ID();
        $current_url = home_url(add_query_arg(NULL, NULL));
        $current_slug = isset($_SERVER['REQUEST_URI']) ? trim(sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])), '/') : '';
        foreach ($redirect_pages as $page_id_or_slug => $settings) {
            // Validate settings
            if (!is_array($settings)) {
                continue;
            }

            // Skip if redirection is not enabled for this entry
            if (empty($settings['enabled'])) {
                continue;
            }

            $is_page_redirect = is_numeric($page_id_or_slug) && $page_id_or_slug == $current_page_id;
            $is_slug_redirect = !is_numeric($page_id_or_slug) && $page_id_or_slug == $current_slug;

            if ($is_page_redirect || $is_slug_redirect) {
                // Sanitize URLs
                $ios_url = !empty($settings['ios_url']) ? esc_url($settings['ios_url']) : '';
                $android_url = !empty($settings['android_url']) ? esc_url($settings['android_url']) : '';
                $backup_url = $is_slug_redirect && !empty($settings['backup_url']) ? esc_url($settings['backup_url']) : '';

                // Set 200 status for custom slugs to prevent 404
                if ($is_slug_redirect) {
                    status_header(200);
                }

                // Only proceed if we have URLs to redirect to
                if (!empty($ios_url) || !empty($android_url) || (!empty($backup_url) && $is_slug_redirect)) {
                    // Enqueue the redirect script
                    wp_enqueue_script(
                        'device-redirect-front',
                        plugins_url('js/redirect.js', __FILE__),
                        array(),
                        DEVICE_REDIRECT_VERSION,
                        true
                    );

                    // Pass configuration to script
                    wp_localize_script(
                        'device-redirect-front',
                        'deviceRedirectConfig',
                        array(
                            'ios' => wp_json_encode($ios_url),
                            'android' => wp_json_encode($android_url),
                            'backup' => wp_json_encode($backup_url),
                            'current' => wp_json_encode($current_url)
                        )
                    );
                }
                break;
            }
        }
    } catch (Exception $e) {
        // Log error if WP_DEBUG is enabled
        if (defined('WP_DEBUG') && WP_DEBUG) {
            wp_log_error('Device Redirect Error: ' . $e->getMessage());
        }
    }
}

// REST API endpoint for slug validation
add_action('rest_api_init', function () {
    register_rest_route('device-redirect/v1', '/validate-slug', array(
        'methods' => 'GET',
        'callback' => 'validate_redirect_slug',
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
});

function validate_redirect_slug($request) {
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
    
    // Get current redirect settings
    $redirect_pages = get_option(DEVICE_REDIRECT_SETTINGS_KEY, []);
    
    // Check existing redirects
    foreach ($redirect_pages as $existing_slug => $settings) {
        if (!is_numeric($existing_slug) && strtolower($existing_slug) === $slug) {
            return new WP_Error(
                'slug_exists',
                'This slug is already used by a redirect',
                ['status' => 400]
            );
        }
    }
    
    return ['available' => true];
}

function handle_redirect_slug_conflicts($slug, $post_ID, $post_status, $post_type, $post_parent, $original_slug) {
    $redirect_pages = get_option(DEVICE_REDIRECT_SETTINGS_KEY, []);
    
    foreach ($redirect_pages as $existing_slug => $settings) {
        if (!is_numeric($existing_slug) && strtolower($existing_slug) === strtolower($slug)) {
            // Get all existing posts/pages
            global $wpdb;
            $suffix = 1;
            
            do {
                $alt_slug = $original_slug . "-$suffix";
                $post_name_check = $wpdb->get_var($wpdb->prepare("SELECT post_name FROM $wpdb->posts WHERE post_name LIKE %s AND ID != %d", $alt_slug, $post_ID));
                $suffix++;
            } while ($post_name_check);
            
            return $alt_slug;
        }
    }
    return $slug;
}

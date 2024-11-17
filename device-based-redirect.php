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
    // Only initialize the settings
    if (false === get_option(DBRE_SETTINGS_KEY)) {
        add_option(DBRE_SETTINGS_KEY, []);
    }
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
    $saved_settings = get_option(DBRE_SETTINGS_KEY, []);
    
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
        'pluginUrl' => plugins_url('', __FILE__),
    ]);
}

function dbre_save_settings() {
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

    // Save the sanitized settings
    update_option(DBRE_SETTINGS_KEY, $sanitized_settings);

    wp_send_json_success([
        'message' => 'Settings saved successfully!',
        'type' => 'success',
        'settings' => $sanitized_settings
    ]);
}


// ===============================================
// Redirection Logic
// ===============================================
function dbre_redirect_logic() {
    try {
        // Get the redirection settings for pages and slugs
        $redirect_pages = get_option(DBRE_SETTINGS_KEY, []);
        if (empty($redirect_pages) || !is_array($redirect_pages)) {
            return;
        }

        $current_page_id = get_the_ID();
        $current_url = home_url(add_query_arg(NULL, NULL));
        //$current_slug = isset($_SERVER['REQUEST_URI']) ? trim(sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])), '/') : '';
        $current_slug = '';
        if (isset($_SERVER['REQUEST_URI'])) {
            $request_path = trim(sanitize_text_field(wp_unslash($_SERVER['REQUEST_URI'])), '/');
            $site_path = wp_parse_url(site_url(), PHP_URL_PATH);
            $site_path = $site_path ? trim($site_path, '/') : '';
            
            if ($site_path && strpos($request_path, $site_path) === 0) {
                $current_slug = substr($request_path, strlen($site_path) + 1);
            } else {
                $current_slug = $request_path;
            }
        }
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

            if ($is_page_redirect) {
                // Sanitize URLs
                $ios_url = !empty($settings['ios_url']) ? esc_url($settings['ios_url']) : '';
                $android_url = !empty($settings['android_url']) ? esc_url($settings['android_url']) : '';

                // Only proceed if we have URLs to redirect to
                if (!empty($ios_url) || !empty($android_url)) {
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
                            'ios' => esc_js($ios_url),
                            'android' => esc_js($android_url),
                            'current' => esc_js($current_url)
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
});

function dbre_validate_slug($request) {
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
    $redirect_pages = get_option(DBRE_SETTINGS_KEY, []);
    
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

function dbre_handle_slug_conflicts($slug, $post_ID, $post_status, $post_type, $post_parent, $original_slug) {
    $redirect_pages = get_option(DBRE_SETTINGS_KEY, []);
    
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

function dbre_handle_custom_slugs($wp) {


    // Get current slug using wp_parse_url
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

    // Check redirects
    $redirect_pages = get_option(DBRE_SETTINGS_KEY, []);
    foreach ($redirect_pages as $page_id_or_slug => $settings) {
        if (!is_numeric($page_id_or_slug) && 
            $page_id_or_slug === $current_slug && 
            !empty($settings['enabled'])) {

            // Get device type - properly sanitized and unslashed
            $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? 
                sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
            
            $is_ios = preg_match('/(ipad|iphone|ipod)/i', $user_agent);
            $is_android = preg_match('/android/i', $user_agent);
            
            // Check if relevant store URL exists for the device
            $has_relevant_store_url = ($is_ios && !empty($settings['ios_url'])) || 
                                    ($is_android && !empty($settings['android_url']));

            // If it's a mobile device and has relevant store URL
            if (($is_ios || $is_android) && $has_relevant_store_url) {
            
                // First localize the script with the configuration
                wp_register_script(
                    'device-redirect-front',
                    plugins_url('js/redirect.js', __FILE__),
                    array(),
                    DBRE_VERSION,
                    false
                );

                // Pass configuration to script
                wp_localize_script(
                    'device-redirect-front',
                    'deviceRedirectConfig',
                    array(
                        'ios' => esc_url($settings['ios_url'] ?? ''),
                        'android' => esc_url($settings['android_url'] ?? ''),
                        'backup' => esc_url($settings['backup_url'] ?? ''),
                        'current' => esc_url(home_url(add_query_arg(NULL, NULL)))
                    )
                );

                // Now enqueue the script
                wp_enqueue_script('device-redirect-front');

                // Use our custom template with correct path
                add_filter('template_include', function($template) {
                    return plugin_dir_path(__FILE__) . 'templates/redirect-template.php';
                }, 999);
                
                return;
            }

            // For all other cases (non-mobile or no relevant store URL)
            if (!empty($settings['backup_url'])) {
                wp_redirect(esc_url($settings['backup_url']));
                exit;
            } else {
                // No backup URL, redirect to homepage
                wp_redirect(home_url());
                exit;
            }
        }
    }
}


function dbre_modify_redirect_canonical() {
    add_filter('redirect_canonical', 'dbre_prevent_old_slug_redirect', 10, 2);
}

function dbre_prevent_old_slug_redirect($redirect_url, $requested_url) {
    // Get current slug using wp_parse_url
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

    // Remove query strings if any
    $current_slug = strtok($current_slug, '?');

    // Check if this slug exists in our redirects
    $redirect_pages = get_option(DBRE_SETTINGS_KEY, []);
    foreach ($redirect_pages as $page_id_or_slug => $settings) {
        if (!is_numeric($page_id_or_slug) && 
            $page_id_or_slug === $current_slug && 
            !empty($settings['enabled'])) {
            // Return false to prevent WordPress's redirect
            return false;
        }
    }

    return $redirect_url;
}


<?php
/**
 * Template for device-specific redirects
 * Handles:
 * - App Store/Play Store redirects
 * - Device-specific URL redirects
 * - Fallback for unsupported devices
 */

if (!defined('ABSPATH')) exit;

// Check if deviceRedirectConfig is available
if (!isset($deviceRedirectConfig)) {
    wp_debug_log('Error: deviceRedirectConfig is not available in template');
    return;
}

// Get user agent for device detection
$user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? 
    sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';

$is_ios = preg_match('/(ipad|iphone|ipod)/i', $user_agent);
$is_android = preg_match('/android/i', $user_agent);

// Get redirect config with fallbacks
$ios_url = isset($deviceRedirectConfig['ios']) ? esc_url($deviceRedirectConfig['ios']) : '';
$android_url = isset($deviceRedirectConfig['android']) ? esc_url($deviceRedirectConfig['android']) : '';
$backup_url = isset($deviceRedirectConfig['backup']) ? esc_url($deviceRedirectConfig['backup']) : '';
$is_store_url = isset($deviceRedirectConfig['isStoreUrl']) ? $deviceRedirectConfig['isStoreUrl'] : false;

// Set appropriate message based on device and redirect type
$redirect_message = 'Redirecting...';
if ($is_store_url) {
    if ($is_ios) {
        $redirect_message = 'Opening App Store...';
        $device_icon = 'apple';
    } elseif ($is_android) {
        $redirect_message = 'Opening Play Store...';
        $device_icon = 'android';
    }
} else {
    if ($is_ios) {
        $redirect_message = 'Redirecting to iOS version...';
        $device_icon = 'apple';
    } elseif ($is_android) {
        $redirect_message = 'Redirecting to Android version...';
        $device_icon = 'android';
    } else {
        $redirect_message = 'Redirecting to appropriate version...';
        $device_icon = 'desktop';
    }
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php 
    wp_enqueue_style(
        'dbre-redirect-template',
        plugins_url('css/redirect-template.css', dirname(__FILE__)),
        array(),
        DBRE_VERSION
    );
    wp_head(); 
    ?>
</head>
<body <?php body_class(); ?>>
    <?php wp_body_open(); ?>
    
    <div class="redirect-container">
        <div class="redirect-message">
            <div class="device-icon <?php echo esc_attr($device_icon); ?>"></div>
            <div class="redirect-spinner"></div>
            <h2><?php echo esc_html($redirect_message); ?></h2>
            
            <?php if ($is_store_url): ?>
            <p class="store-note">
                <?php if ($is_ios): ?>
                    If the App Store doesn't open automatically, 
                    <a href="<?php echo esc_url($ios_url); ?>">click here</a>
                <?php elseif ($is_android): ?>
                    If the Play Store doesn't open automatically, 
                    <a href="<?php echo esc_url($android_url); ?>">click here</a>
                <?php endif; ?>
            </p>
            <?php endif; ?>

            <div class="redirect-actions">
                <?php if (!empty($backup_url)): ?>
                    <a href="<?php echo esc_url($backup_url); ?>" class="action-button">
                        Continue to Website
                    </a>
                <?php endif; ?>
                
                <a href="<?php echo esc_url(home_url('/')); ?>" class="action-button secondary">
                    Go to Home Page
                </a>
            </div>
        </div>
    </div>

    <?php wp_footer(); ?>
</body>
</html> 
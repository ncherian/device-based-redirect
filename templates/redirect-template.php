<?php
/**
 * Template for app store redirects
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php 
    // Enqueue the CSS file
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
            <div class="redirect-spinner"></div>
            <h2>Redirecting to store...</h2>
            <a href="<?php echo esc_url(home_url('/')); ?>" class="home-button">
                Go to Home Page
            </a>
        </div>
    </div>

    <?php wp_footer(); ?>
</body>
</html> 
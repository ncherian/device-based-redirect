=== Device Based Redirect ===
Contributors: ncherian
Donate link: https://www.buymeacoffee.com/indimakes
Tags: mobile redirect, device specific redirects, app redirects, platform specific redirect, store links
Requires at least: 5.0
Tested up to: 6.7
Stable tag: 1.1.0
Requires PHP: 7.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Redirect users to your app pages in app store or play store based on their device type with custom URLs and page-specific redirects.

== Description ==

Device Based Redirect allows you to easily set up redirects to your mobile apps based on the user's device. Perfect for promoting your mobile apps to website visitors and implementing platform-specific deep linking through a single URL.

Features:

* Page-specific redirects - Configure different redirects for different pages on your site
* Custom URL redirects - Create custom URLs that redirect users based on their device
* iOS and Android app store links - Set different destinations for iOS and Android users
* Deep linking support - Direct users to specific sections of your app through platform-specific deep links
* Fallback URLs for other devices - Specify where non-mobile users should be redirected
* Easy-to-use admin interface - Simple configuration through WordPress admin panel
* Global enable/disable option - Quickly turn all redirects on/off

Use Cases:

* App Store Promotion: Direct mobile users to your app's store listing while showing desktop users your website
* Deep Linking: Create a single URL that opens different app screens on iOS and Android
* Marketing Campaigns: Share one link that works across all platforms
* Cross-Platform Navigation: Seamlessly guide users to the right platform-specific destination

The plugin handles user agent detection and routing automatically, making it easy to implement complex platform-specific navigation through simple WordPress configuration.

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/device-based-redirect`
2. Activate the plugin through the 'Plugins' screen in WordPress
3. Go to Settings -> Device Redirect to configure redirects

== Frequently Asked Questions ==

= Can I set different redirects for different pages? =
Yes, you can configure page-specific redirects as well as custom URL redirects.

= Can I temporarily disable all redirects? =
Yes, use the bulk actions to disable directs in bulk. Alternatively, you can deactivate the plugin temporarily.

= Is there a limit to the number of redirects I can set? =
No, there is no limit to the number of redirects you can set.

= Is the Backup URL or Other Device URL required? =
No, it is optional. If not set, users will be redirected to the current page for Page redirects and home page for Slug redirects in non-mobile devices.

= What is the nature of redirects? =
Redirects are of 302 type as they are not permanent.

== Screenshots ==

1. Accessing Device Redirect Settings Page
2. Configuring Pages or URLs for Device Specific Redirection
3. Edit URL Redirects within table itself in Edit mode.
4. Hover to access Edit and Remove actions
5. Add Slug or Page Redirects on left sidebar

== Changelog ==

= 1.1.0 =
* Migrated to separate database table for redirects
* Added transient Cache for fetching redirects on end-user pages
* Added new and improved admin UI for managing redirects
* Added pagination for URL redirects in admin
* Added Bulk Actions for Disable/Enable/Delete
* Added Filter for Redirect Types
* Added smooth scrolling to top of page when navigating between pages
* URL validation limited to basic patterns for better flexibility 

= 1.0.0 =
* Initial release

== Upgrade Notice ==
= 1.1.0 =
* Update immediately to take advantage of the new and improved admin UI.
* Redirects are now stored in a separate database table for better performance.

= 1.0.0 =
Initial release
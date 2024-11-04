// js/redirect.js
(function() {
    // Wait for DOM content to be loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Check if config exists
        if (typeof deviceRedirectConfig === 'undefined') {
            console.error('Device redirect configuration not found');
            return;
        }

        var userAgent = navigator.userAgent || navigator.vendor || window.opera;
        var config = deviceRedirectConfig;

        function redirectToStore() {
            if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                if (config.ios) {
                    window.location.replace(config.ios);
                    return;
                }
            }
            else if (/android/i.test(userAgent)) {
                if (config.android) {
                    window.location.replace(config.android);
                    return;
                }
            }
            else if (config.backup && config.backup !== config.current) {
                window.location.replace(config.backup);
                return;
            }
        }

        redirectToStore();
    });
})();
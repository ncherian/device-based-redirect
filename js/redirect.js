// js/redirect.js
(function() {
    var userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    var config = deviceRedirectConfig; // We'll pass this via wp_localize_script

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
})();
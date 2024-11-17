import React, { useState, useEffect } from 'react';
import './styles.css';

const ToggleSwitch = ({ enabled, onChange, small = false }) => (
  <label className={`toggle-switch ${small ? 'toggle-switch-small' : ''}`}>
    <input
      type="checkbox"
      checked={enabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="toggle-slider"></span>
  </label>
);

const DeviceRedirectSettings = () => {
    const [pageRedirects, setPageRedirects] = useState([]);
    const [slugRedirects, setSlugRedirects] = useState([]);
    const [selectedPage, setSelectedPage] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [error, setError] = useState({ type: '', message: '' });
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState(null);
    const [urlValidationErrors, setUrlValidationErrors] = useState({});
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [initialData, setInitialData] = useState({
      pageRedirects: [],
      slugRedirects: []
    });

  // To set up the leave page warning
  useEffect(() => {
    const handleBeforeUnload = (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            const message = 'You have unsaved changes. Are you sure you want to leave?';
            e.returnValue = message;
            return message;
        }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);

// To detect changes
useEffect(() => {
  const hasChanges = 
    JSON.stringify(initialData.pageRedirects) !== JSON.stringify(pageRedirects) ||
    JSON.stringify(initialData.slugRedirects) !== JSON.stringify(slugRedirects);
  
  setHasUnsavedChanges(hasChanges);
}, [pageRedirects, slugRedirects, initialData]);


  // Load initial data
  useEffect(() => {
    const loadSavedSettings = () => {
        const savedSettings = deviceRedirectData.settings || {};
        const pages = [];
        const slugs = [];
        
        Object.entries(savedSettings).forEach(([key, value]) => {
            if (Number.isInteger(parseInt(key))) {
                pages.push({
                    id: key,
                    title: deviceRedirectData.pages.find(p => p.value.toString() === key)?.label || '',
                    iosUrl: value.ios_url || '',
                    androidUrl: value.android_url || '',
                    enabled: Boolean(value.enabled)
                });
            } else {
                slugs.push({
                    slug: key,
                    iosUrl: value.ios_url || '',
                    androidUrl: value.android_url || '',
                    backupUrl: value.backup_url || '',
                    enabled: Boolean(value.enabled)
                });
            }
        });

        // Set both current and initial state
        setPageRedirects(pages);
        setSlugRedirects(slugs);
        
        // Set initial data for change tracking
        setInitialData({
          pageRedirects: [...pages],
          slugRedirects: [...slugs]
        });

        debugSavedData();
    };

    loadSavedSettings();
  }, []);

  useEffect(() => {
    const detectChanges = () => {
        const hasChanges = 
            JSON.stringify(initialData.pageRedirects) !== JSON.stringify(pageRedirects) ||
            JSON.stringify(initialData.slugRedirects) !== JSON.stringify(slugRedirects);
        
        setHasUnsavedChanges(hasChanges);
    };

    // Only run change detection if initialData has been set
    if (initialData.pageRedirects.length > 0 || initialData.slugRedirects.length > 0) {
        detectChanges();
    }
}, [pageRedirects, slugRedirects, initialData]);

  const debugSavedData = () => {
    console.group('Device Redirect Debug Info');
    console.log('Loaded Settings:', deviceRedirectData.settings);
    console.log('Current Page Redirects:', pageRedirects);
    console.log('Current Slug Redirects:', slugRedirects);
    console.groupEnd();
  };

  const handlePageRedirectChange = (id, field, value) => {
    const updated = pageRedirects.map(r =>
        r.id === id ? { ...r, [field]: value } : r
    );
    setPageRedirects(updated);
    setHasUnsavedChanges(true);
};

const handleSlugRedirectChange = (slug, field, value) => {
    const updated = slugRedirects.map(r =>
        r.slug === slug ? { ...r, [field]: value } : r
    );
    setSlugRedirects(updated);
    setHasUnsavedChanges(true);
};

  // Function to validate a slug
  // const validateSlug = async (slug) => {
  //   try {
  //     const response = await fetch(
  //       `${deviceRedirectData.restUrl}device-redirect/v1/validate-slug?slug=${encodeURIComponent(slug)}`,
  //       {
  //         headers: {
  //           'X-WP-Nonce': deviceRedirectData.restNonce
  //         }
  //       }
  //     );
      
  //     if (!response.ok) {
  //       const error = await response.json();
  //       throw new Error(error.message);
  //     }
      
  //     return true;
  //   } catch (error) {
  //     setError({ type: 'slug', message: error.message });
  //     return false;
  //   }
  // };


  const removePageRedirect = (id) => {
    if (window.confirm('Are you sure you want to remove this redirect?')) {
        setPageRedirects(pageRedirects.filter(redirect => redirect.id !== id));
        
        const newValidationErrors = { ...urlValidationErrors };
        delete newValidationErrors[`page-${id}-ios`];
        delete newValidationErrors[`page-${id}-android`];
        setUrlValidationErrors(newValidationErrors);
        setHasUnsavedChanges(true);
    }
};


  const handleAddPageRedirect = () => {
    if (!selectedPage) {
        setError({ type: 'page', message: 'Please select a page' });
        return;
    }
    
    if (pageRedirects.some(redirect => redirect.id === selectedPage)) {
        setError({ type: 'page', message: 'This page has already been added!' });
        return;
    }

    const pageTitle = deviceRedirectData.pages.find(
        p => p.value.toString() === selectedPage.toString()
    )?.label || '';

    setPageRedirects([
        ...pageRedirects,
        {
            id: selectedPage,
            title: pageTitle,
            iosUrl: '',
            androidUrl: '',
            enabled: true
        }
    ]);
    
    setSelectedPage('');
    setError({ type: '', message: '' });
    setHasUnsavedChanges(true);
};

  
  // URL format validation function
  const validateUrl = (url, type) => {
    if (!url) return true; // Empty URLs are allowed
    
    const patterns = {
      ios: /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/[a-zA-Z0-9\-]+\/id[0-9]+(\?[a-zA-Z0-9\-\_\=]+(&[a-zA-Z0-9\-\_\=]+)*)?$/,
      android: /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[a-zA-Z0-9\.\_]+(&[a-zA-Z0-9\-\_\=]+)*$/,
      backup: /^https?:\/\/[a-zA-Z0-9-._~:/?#\[\]@!$&'()*+,;=%.]+$/ 
    };
    
    return patterns[type]?.test(url) ?? false;
  };

const removeSlugRedirect = (slug) => {
    if (window.confirm('Are you sure you want to remove this redirect?')) {
        setSlugRedirects(slugRedirects.filter(redirect => redirect.slug !== slug));
        
        const newValidationErrors = { ...urlValidationErrors };
        delete newValidationErrors[`slug-${slug}-ios`];
        delete newValidationErrors[`slug-${slug}-android`];
        setUrlValidationErrors(newValidationErrors);
        setHasUnsavedChanges(true);
    }
};
  
  const handleAddSlugRedirect = async () => {
    if (!newSlug) {
      setError({ type: 'slug', message: 'Please enter a custom slug' });
      return;
    }
    
    // Clean the slug (remove spaces, special characters)
    const cleanSlug = newSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  
    if (slugRedirects.some(redirect => redirect.slug === cleanSlug)) {
      setError({ type: 'slug', message: 'This slug has already been added!' });
      return;
    }
  
    // Validate slug availability
    try {
      const response = await fetch(
        `${deviceRedirectData.restUrl}device-redirect/v1/validate-slug?slug=${encodeURIComponent(cleanSlug)}`,
        {
          headers: {
            'X-WP-Nonce': deviceRedirectData.restNonce
          }
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        setError({ type: 'slug', message: data.message || 'This slug is not available' });
        return;
      }
  
      setSlugRedirects([...slugRedirects, {
        slug: cleanSlug,
        iosUrl: '',
        androidUrl: '',
        backupUrl: '',
        enabled: true
      }]);
      
      setNewSlug('');
      setError({ type: '', message: '' });
      setHasUnsavedChanges(true);  // Mark as having unsaved changes
    } catch (error) {
      setError({ type: 'slug', message: 'Error validating slug. Please try again.' });
    }
  };
  
  
  const handleSlugChange = (e) => {
    // Clean the slug as user types
    const value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
    
    setNewSlug(value);
    
    // Clear any previous error
    if (error.type === 'slug') {
      setError({ type: '', message: '' });
    }
  };
  
  // const handleBackupUrlChange = (slug, value) => {
  //   const updated = slugRedirects.map(r =>
  //     r.slug === slug ? { ...r, backupUrl: value } : r
  //   );
  //   setSlugRedirects(updated);
  // };
  
 // Update the handleUrlChange function to handle backup URL validation
 const handleUrlChange = (redirectType, id, type, value) => {
  const isValid = validateUrl(value, type);
  const errorKey = `${redirectType}-${id}-${type}`;
  
  if (value) {
      setUrlValidationErrors(prev => ({
          ...prev,
          [errorKey]: isValid ? null : getUrlErrorMessage(type)
      }));
  } else {
      setUrlValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[errorKey];
          return newErrors;
      });
  }

  if (redirectType === 'page') {
      handlePageRedirectChange(id, type === 'ios' ? 'iosUrl' : 'androidUrl', value);
  } else {
      handleSlugRedirectChange(
          id, 
          type === 'ios' ? 'iosUrl' : 
          type === 'android' ? 'androidUrl' : 
          'backupUrl',
          value
      );
  }
};

// Add helper function to get appropriate error messages
const getUrlErrorMessage = (type) => {
    switch (type) {
      case 'ios':
        return 'Invalid App Store URL format';
      case 'android':
        return 'Invalid Play Store URL format';
      case 'backup':
        return 'Invalid URL format';
      default:
        return 'Invalid URL';
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    
    const settings = {};
    
    pageRedirects.forEach(redirect => {
        settings[redirect.id] = {
            ios_url: redirect.iosUrl,
            android_url: redirect.androidUrl,
            enabled: redirect.enabled
        };
    });
    
    slugRedirects.forEach(redirect => {
        settings[redirect.slug] = {
            ios_url: redirect.iosUrl,
            android_url: redirect.androidUrl,
            backup_url: redirect.backupUrl,
            enabled: redirect.enabled
        };
    });
    
    try {
        const formData = new FormData();
        formData.append('action', 'save_device_redirect_settings');
        formData.append('nonce', deviceRedirectData.nonce);
        formData.append('settings', JSON.stringify(settings));
        
        const response = await fetch(deviceRedirectData.ajaxUrl, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update the initial data to match current state
            setInitialData({
                pageRedirects: [...pageRedirects],
                slugRedirects: [...slugRedirects]
            });
            
            setHasUnsavedChanges(false);

            setNotification({
                message: data.data.message,
                type: 'success'
            });
            
            setTimeout(() => {
                setNotification(null);
            }, 5000);
        } else {
            throw new Error(data.data || 'Save failed');
        }
    } catch (error) {
        setNotification({
            message: `Error saving settings: ${error.message}`,
            type: 'error'
        });
    } finally {
        setSaving(false);
    }
};

const StickySaveBar = ({ onSave, saving, hasUnsavedChanges }) => {
  if (!hasUnsavedChanges) return null;

  return (
    <div className="sticky-save-bar">
      <div className="sticky-save-content">
        <div className="changes-indicator">
          <span className="dashicons dashicons-warning"></span>
          You have unsaved changes
        </div>
        <div className="sticky-save-actions">
          <button
            onClick={onSave}
            disabled={saving}
            className="button button-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

  return (
    <div className="wrap">
      <h1>Device-Based Redirection Settings</h1>
      
      {/* Notification component */}
      {notification && (
      <div className={`notice notice-${notification.type} is-dismissible`}>
        <p>{notification.message}</p>
        <button 
          type="button" 
          className="notice-dismiss"
          onClick={() => setNotification(null)}
        >
          <span className="screen-reader-text">Dismiss this notice.</span>
        </button>
      </div>
    )}

    {hasUnsavedChanges && (
      <div className="notice notice-warning inline">
        <p>
          <strong>You have unsaved changes.</strong> Don't forget to save your changes when you're done editing.
        </p>
      </div>
    )}
      
      <div className="device-redirect-container">

        {/* Page Redirects Section */}
        <div className="section">
          <h2>Page Redirects</h2>
          
          <div className="add-new">
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
            >
              <option value="">Select a page</option>
              {deviceRedirectData.pages.map(page => (
                <option key={page.value} value={page.value}>{page.label}</option>
              ))}
            </select>
            <button onClick={handleAddPageRedirect} className="button button-primary">
              Add Page Redirect
            </button>
          </div>
          
          {error.type === 'page' && (
            <div className="error-message">{error.message}</div>
          )}

            <table className="wp-list-table widefat fixed striped">
            <thead>
                <tr>
                <th>Page</th>
                <th>iOS URL</th>
                <th>Android URL</th>
                <th>Enabled</th>
                <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {pageRedirects.map(redirect => (
                <tr key={redirect.id}>
                    <td>{redirect.title}</td>
                    <td>
                    <div className="url-input-container">
                        <input
                        type="url"
                        value={redirect.iosUrl}
                        onChange={(e) => handleUrlChange('page', redirect.id, 'ios', e.target.value)}
                        placeholder="https://apps.apple.com/..."
                        className={`regular-text ${urlValidationErrors[`page-${redirect.id}-ios`] ? 'error' : ''}`}
                        />
                        {urlValidationErrors[`page-${redirect.id}-ios`] && (
                        <div className="url-validation-error">
                            {urlValidationErrors[`page-${redirect.id}-ios`]}
                        </div>
                        )}
                    </div>
                    </td>
                    <td>
                    <div className="url-input-container">
                        <input
                        type="url"
                        value={redirect.androidUrl}
                        onChange={(e) => handleUrlChange('page', redirect.id, 'android', e.target.value)}
                        placeholder="https://play.google.com/..."
                        className={`regular-text ${urlValidationErrors[`page-${redirect.id}-android`] ? 'error' : ''}`}
                        />
                        {urlValidationErrors[`page-${redirect.id}-android`] && (
                        <div className="url-validation-error">
                            {urlValidationErrors[`page-${redirect.id}-android`]}
                        </div>
                        )}
                    </div>
                    </td>
                    <td>
                    <ToggleSwitch
                        enabled={redirect.enabled}
                        onChange={(checked) => {
                        const updated = pageRedirects.map(r =>
                            r.id === redirect.id ? { ...r, enabled: checked } : r
                        );
                        setPageRedirects(updated);
                        setHasUnsavedChanges(true);
                        }}
                        small={true}
                    />
                    </td>
                    <td>
                    <button
                        onClick={() => removePageRedirect(redirect.id)}
                        className="button button-secondary"
                    >
                        Remove
                    </button>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>

        {/* Slug Redirects Section */}
        <div className="section">
        <h2>Custom URL Redirects</h2>
        
        <div className="add-new">
        <div className="url-input-group">
            <span className="url-prefix">{deviceRedirectData.homeUrl}/</span>
            <input
                type="text"
                value={newSlug}
                onChange={handleSlugChange}
                placeholder="Enter slug"
                className="regular-text slug-input"
              />
            </div>
            <button 
                onClick={handleAddSlugRedirect} 
                className="button button-primary"
            >
                Add URL Redirect
            </button>
        </div>
        
        {error.type === 'slug' && (
            <div className="error-message">{error.message}</div>
        )}

        <table className="wp-list-table widefat fixed striped">
            <thead>
            <tr>
                <th>Custom Redirect URL</th>
                <th>iOS URL</th>
                <th>Android URL</th>
                <th>Other Devices URL</th>
                <th>Enabled</th>
                <th>Actions</th>
            </tr>
            </thead>
            <tbody>
            {slugRedirects.map(redirect => (
                <tr key={redirect.slug}>
                <td>{deviceRedirectData.homeUrl}/{redirect.slug}</td>
                <td>
                    <div className="url-input-container">
                    <input
                        type="url"
                        value={redirect.iosUrl}
                        onChange={(e) => handleUrlChange('slug', redirect.slug, 'ios', e.target.value)}
                        placeholder="https://apps.apple.com/..."
                        className={`regular-text ${urlValidationErrors[`slug-${redirect.slug}-ios`] ? 'error' : ''}`}
                    />
                    {urlValidationErrors[`slug-${redirect.slug}-ios`] && (
                        <div className="url-validation-error">
                        {urlValidationErrors[`slug-${redirect.slug}-ios`]}
                        </div>
                    )}
                    </div>
                </td>
                <td>
                    <div className="url-input-container">
                    <input
                        type="url"
                        value={redirect.androidUrl}
                        onChange={(e) => handleUrlChange('slug', redirect.slug, 'android', e.target.value)}
                        placeholder="https://play.google.com/..."
                        className={`regular-text ${urlValidationErrors[`slug-${redirect.slug}-android`] ? 'error' : ''}`}
                    />
                    {urlValidationErrors[`slug-${redirect.slug}-android`] && (
                        <div className="url-validation-error">
                        {urlValidationErrors[`slug-${redirect.slug}-android`]}
                        </div>
                    )}
                    </div>
                </td>
                <td>
                    <div className="url-input-container">
                        <input
                        type="url"
                        value={redirect.backupUrl}
                        onChange={(e) => handleUrlChange('slug', redirect.slug, 'backup', e.target.value)}
                        placeholder="https://..."
                        className={`regular-text ${urlValidationErrors[`slug-${redirect.slug}-backup`] ? 'error' : ''}`}
                        />
                        {urlValidationErrors[`slug-${redirect.slug}-backup`] && (
                        <div className="url-validation-error">
                            {urlValidationErrors[`slug-${redirect.slug}-backup`]}
                        </div>
                        )}
                    </div>
                    </td>
                <td>
                    <ToggleSwitch
                        enabled={redirect.enabled}
                        onChange={(checked) => {
                        const updated = slugRedirects.map(r =>
                            r.slug === redirect.slug ? { ...r, enabled: checked } : r
                        );
                        setSlugRedirects(updated);
                        setHasUnsavedChanges(true);
                        }}
                        small={true}
                    />
                </td>
                <td>
                    <button
                    onClick={() => removeSlugRedirect(redirect.slug)}
                    className="button button-secondary"
                    >
                    Remove
                    </button>
                </td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>

        <div className="submit-section">
            <div className="submit-wrapper">
            <button
                onClick={saveSettings}
                disabled={saving}
                className="button button-primary button-large"
            >
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
            
            {notification && notification.type === 'success' && (
              <div className="inline-notice notice-success">
                <span>{notification.message}</span>
              </div>
            )}
            </div>
        </div>
        <div className="coffee-section">
        <div className="coffee-message">
            <h3>Support the Development</h3>
            <p>If you find this plugin helpful, please consider supporting its continued development. Your support helps keep the plugin updated and free for everyone! 🙂</p>
        </div>
        <div className="coffee-button-container">
            <a href="https://www.buymeacoffee.com/indimakes" target="_blank" rel="noopener noreferrer">
                <img 
                    src={deviceRedirectData.pluginUrl + '/assets/bmc-button.png'}
                    alt="Buy Me A Coffee"
                    className="coffee-button-img"
                />
            </a>
        </div>
        </div>
      </div>
      <StickySaveBar
      onSave={saveSettings}
      saving={saving}
      hasUnsavedChanges={hasUnsavedChanges}
    />
    </div>
  );
};

export default DeviceRedirectSettings;
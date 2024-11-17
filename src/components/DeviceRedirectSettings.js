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
    const [editingRedirects, setEditingRedirects] = useState({});
    const [editingValues, setEditingValues] = useState({});

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
                    backupUrl: value.backup_url || '',
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


  const removePageRedirect = async (id) => {
    if (window.confirm('Are you sure you want to remove this redirect?')) {
        // First update the local state
        const updatedPageRedirects = pageRedirects.filter(redirect => redirect.id !== id);
        setPageRedirects(updatedPageRedirects);
        
        // Clear validation errors
        const newValidationErrors = { ...urlValidationErrors };
        delete newValidationErrors[`page-${id}-ios`];
        delete newValidationErrors[`page-${id}-android`];
        delete newValidationErrors[`page-${id}-backup`];
        setUrlValidationErrors(newValidationErrors);

        // Prepare and save settings
        const settings = {};
        
        updatedPageRedirects.forEach(redirect => {
            settings[redirect.id] = {
                ios_url: redirect.iosUrl,
                android_url: redirect.androidUrl,
                backup_url: redirect.backupUrl,
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
                setInitialData({
                    pageRedirects: updatedPageRedirects,
                    slugRedirects: [...slugRedirects]
                });
                setHasUnsavedChanges(false);
                
                setNotification({
                    message: 'Redirect removed successfully!',
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
                message: `Error removing redirect: ${error.message}`,
                type: 'error'
            });
            // Revert the state if save failed
            setPageRedirects(pageRedirects);
        }
    }
};


  const handleAddPageRedirect = async () => {
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

    const newRedirect = {
        id: selectedPage,
        title: pageTitle,
        iosUrl: '',
        androidUrl: '',
        backupUrl: '',
        enabled: true
    };

    const updatedPageRedirects = [...pageRedirects, newRedirect];

    // Prepare settings for save
    const settings = {};
    updatedPageRedirects.forEach(redirect => {
        settings[redirect.id] = {
            ios_url: redirect.iosUrl,
            android_url: redirect.androidUrl,
            backup_url: redirect.backupUrl,
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
            setPageRedirects(updatedPageRedirects);
            setInitialData({
                pageRedirects: updatedPageRedirects,
                slugRedirects: [...slugRedirects]
            });
            setSelectedPage('');
            setError({ type: '', message: '' });
            
            setNotification({
                message: 'Page redirect added successfully!',
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
            message: `Error adding page redirect: ${error.message}`,
            type: 'error'
        });
    }
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

const removeSlugRedirect = async (slug) => {
    if (window.confirm('Are you sure you want to remove this redirect?')) {
        // First update the local state
        const updatedSlugRedirects = slugRedirects.filter(redirect => redirect.slug !== slug);
        setSlugRedirects(updatedSlugRedirects);
        
        // Clear validation errors
        const newValidationErrors = { ...urlValidationErrors };
        delete newValidationErrors[`slug-${slug}-ios`];
        delete newValidationErrors[`slug-${slug}-android`];
        delete newValidationErrors[`slug-${slug}-backup`];
        setUrlValidationErrors(newValidationErrors);

        // Prepare and save settings
        const settings = {};
        
        pageRedirects.forEach(redirect => {
            settings[redirect.id] = {
                ios_url: redirect.iosUrl,
                android_url: redirect.androidUrl,
                backup_url: redirect.backupUrl,
                enabled: redirect.enabled
            };
        });
        
        updatedSlugRedirects.forEach(redirect => {
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
                setInitialData({
                    pageRedirects: [...pageRedirects],
                    slugRedirects: updatedSlugRedirects
                });
                setHasUnsavedChanges(false);
                
                setNotification({
                    message: 'Redirect removed successfully!',
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
                message: `Error removing redirect: ${error.message}`,
                type: 'error'
            });
            // Revert the state if save failed
            setSlugRedirects(slugRedirects);
        }
    }
};
  
  const handleAddSlugRedirect = async () => {
    if (!newSlug) {
        setError({ type: 'slug', message: 'Please enter a custom slug' });
        return;
    }
    
    // Clean the slug
    const cleanSlug = newSlug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    
    if (slugRedirects.some(redirect => redirect.slug === cleanSlug)) {
        setError({ type: 'slug', message: 'This slug has already been added!' });
        return;
    }

    try {
        // Validate slug first
        const validateResponse = await fetch(
            `${deviceRedirectData.restUrl}device-redirect/v1/validate-slug?slug=${encodeURIComponent(cleanSlug)}`,
            {
                headers: {
                    'X-WP-Nonce': deviceRedirectData.restNonce
                }
            }
        );
        
        const validateData = await validateResponse.json();
        
        if (!validateResponse.ok) {
            setError({ type: 'slug', message: validateData.message || 'This slug is not available' });
            return;
        }

        const newRedirect = {
            slug: cleanSlug,
            iosUrl: '',
            androidUrl: '',
            backupUrl: '',
            enabled: true
        };

        const updatedSlugRedirects = [...slugRedirects, newRedirect];

        // Prepare settings for save
        const settings = {};
        pageRedirects.forEach(redirect => {
            settings[redirect.id] = {
                ios_url: redirect.iosUrl,
                android_url: redirect.androidUrl,
                backup_url: redirect.backupUrl,
                enabled: redirect.enabled
            };
        });
        
        updatedSlugRedirects.forEach(redirect => {
            settings[redirect.slug] = {
                ios_url: redirect.iosUrl,
                android_url: redirect.androidUrl,
                backup_url: redirect.backupUrl,
                enabled: redirect.enabled
            };
        });

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
            setSlugRedirects(updatedSlugRedirects);
            setInitialData({
                pageRedirects: [...pageRedirects],
                slugRedirects: updatedSlugRedirects
            });
            setNewSlug('');
            setError({ type: '', message: '' });
            
            setNotification({
                message: 'Custom URL redirect added successfully!',
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
            message: `Error adding custom URL redirect: ${error.message}`,
            type: 'error'
        });
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
  
 // Update the handleUrlChange function
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
      handlePageRedirectChange(
          id, 
          type === 'ios' ? 'iosUrl' : 
          type === 'android' ? 'androidUrl' : 
          'backupUrl',
          value
      );
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
            backup_url: redirect.backupUrl,
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

const getAllRedirects = () => {
  const pageRedirectsWithType = pageRedirects.map(redirect => ({
    ...redirect,
    type: 'page',
    displayUrl: redirect.title
  }));
  
  const slugRedirectsWithType = slugRedirects.map(redirect => ({
    ...redirect,
    type: 'custom',
    displayUrl: `${deviceRedirectData.homeUrl}/${redirect.slug}`,
    id: redirect.slug // normalize the id field
  }));
  
  return [...pageRedirectsWithType, ...slugRedirectsWithType];
};

const handleEditClick = (redirect) => {
  // First, check if any other redirect is being edited
  const currentlyEditing = Object.entries(editingRedirects).find(([id, isEditing]) => isEditing);
  
  if (currentlyEditing) {
    const [currentEditId] = currentlyEditing;
    // Cancel the current edit first
    setEditingRedirects(prev => ({
      ...prev,
      [currentEditId]: false
    }));
    setEditingValues(prev => {
      const newValues = { ...prev };
      delete newValues[currentEditId];
      return newValues;
    });
  }

  // Then start editing the new redirect
  setEditingRedirects(prev => ({
    ...prev,
    [redirect.id]: true
  }));
  setEditingValues(prev => ({
    ...prev,
    [redirect.id]: {
      iosUrl: redirect.iosUrl,
      androidUrl: redirect.androidUrl,
      backupUrl: redirect.backupUrl
    }
  }));
};

const handleCancelEdit = (redirect) => {
  setEditingRedirects(prev => ({
    ...prev,
    [redirect.id]: false
  }));
  setEditingValues(prev => {
    const newValues = { ...prev };
    delete newValues[redirect.id];
    return newValues;
  });
};

const handleSaveEdit = async (redirect) => {
  const editedValues = editingValues[redirect.id];
  const settings = {};
  
  let updatedPageRedirects = [...pageRedirects];
  let updatedSlugRedirects = [...slugRedirects];

  // Prepare settings object
  if (redirect.type === 'page') {
    updatedPageRedirects = pageRedirects.map(r =>
      r.id === redirect.id ? {
        ...r,
        iosUrl: editedValues.iosUrl,
        androidUrl: editedValues.androidUrl,
        backupUrl: editedValues.backupUrl
      } : r
    );
    setPageRedirects(updatedPageRedirects);
    
    updatedPageRedirects.forEach(r => {
      settings[r.id] = {
        ios_url: r.iosUrl,
        android_url: r.androidUrl,
        backup_url: r.backupUrl,
        enabled: r.enabled
      };
    });
    
    slugRedirects.forEach(r => {
      settings[r.slug] = {
        ios_url: r.iosUrl,
        android_url: r.androidUrl,
        backup_url: r.backupUrl,
        enabled: r.enabled
      };
    });
  } else {
    updatedSlugRedirects = slugRedirects.map(r =>
      r.slug === redirect.id ? {
        ...r,
        iosUrl: editedValues.iosUrl,
        androidUrl: editedValues.androidUrl,
        backupUrl: editedValues.backupUrl
      } : r
    );
    setSlugRedirects(updatedSlugRedirects);
    
    pageRedirects.forEach(r => {
      settings[r.id] = {
        ios_url: r.iosUrl,
        android_url: r.androidUrl,
        backup_url: r.backupUrl,
        enabled: r.enabled
      };
    });
    
    updatedSlugRedirects.forEach(r => {
      settings[r.slug] = {
        ios_url: r.iosUrl,
        android_url: r.androidUrl,
        backup_url: r.backupUrl,
        enabled: r.enabled
      };
    });
  }

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
      // Update initialData to match current state
      setInitialData({
        pageRedirects: updatedPageRedirects,
        slugRedirects: updatedSlugRedirects
      });

      setEditingRedirects(prev => ({
        ...prev,
        [redirect.id]: false
      }));
      setEditingValues(prev => {
        const newValues = { ...prev };
        delete newValues[redirect.id];
        return newValues;
      });
      
      setNotification({
        message: 'Changes saved successfully!',
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
      message: `Error saving changes: ${error.message}`,
      type: 'error'
    });
  }
};

  return (
    <div className="wrap">
      <h1>Device-Based Redirection Settings</h1>
      
      {/* Notification component */}
      {notification && (
        <div className="sticky-notification notice notice-${notification.type}">
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
      
      <div className="device-redirect-container">

        {/* Page Redirects Section */}
        <div className="section">
          <h2>Redirects</h2>
          
          {/* Add New Page Redirect */}
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

          {/* Add New Custom URL Redirect */}
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
          
          {error.type === 'page' && (
            <div className="error-message">{error.message}</div>
          )}
          {error.type === 'slug' && (
            <div className="error-message">{error.message}</div>
          )}

          <table className="wp-list-table widefat fixed striped">
            <thead>
              <tr>
                <th>Type</th>
                <th>URL/Page</th>
                <th>URLs</th>
                <th>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {getAllRedirects().map(redirect => (
                <tr key={redirect.id}>
                  <td>
                    <span className={`redirect-type ${redirect.type}`}>
                      {redirect.type === 'page' ? 'Page Redirect' : 'Custom URL'}
                    </span>
                  </td>
                  <td>{redirect.displayUrl}</td>
                  <td className="url-actions-cell">
                    {editingRedirects[redirect.id] ? (
                      <>
                        <div className="url-fields-container">
                          <div className="url-field">
                            <label>iOS URL:</label>
                            <div className="url-input-container">
                              <input
                                type="url"
                                value={editingValues[redirect.id].iosUrl}
                                onChange={(e) => setEditingValues(prev => ({
                                  ...prev,
                                  [redirect.id]: {
                                    ...prev[redirect.id],
                                    iosUrl: e.target.value
                                  }
                                }))}
                                placeholder="https://apps.apple.com/..."
                                className={`regular-text ${urlValidationErrors[`${redirect.type}-${redirect.id}-ios`] ? 'error' : ''}`}
                              />
                              {urlValidationErrors[`${redirect.type}-${redirect.id}-ios`] && (
                                <div className="url-validation-error">
                                  {urlValidationErrors[`${redirect.type}-${redirect.id}-ios`]}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="url-field">
                            <label>Android URL:</label>
                            <div className="url-input-container">
                              <input
                                type="url"
                                value={editingValues[redirect.id].androidUrl}
                                onChange={(e) => setEditingValues(prev => ({
                                  ...prev,
                                  [redirect.id]: {
                                    ...prev[redirect.id],
                                    androidUrl: e.target.value
                                  }
                                }))}
                                placeholder="https://play.google.com/..."
                                className={`regular-text ${urlValidationErrors[`${redirect.type}-${redirect.id}-android`] ? 'error' : ''}`}
                              />
                              {urlValidationErrors[`${redirect.type}-${redirect.id}-android`] && (
                                <div className="url-validation-error">
                                  {urlValidationErrors[`${redirect.type}-${redirect.id}-android`]}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="url-field">
                            <label>Other Devices URL:</label>
                            <div className="url-input-container">
                              <input
                                type="url"
                                value={editingValues[redirect.id].backupUrl}
                                onChange={(e) => setEditingValues(prev => ({
                                  ...prev,
                                  [redirect.id]: {
                                    ...prev[redirect.id],
                                    backupUrl: e.target.value
                                  }
                                }))}
                                placeholder="https://..."
                                className={`regular-text ${urlValidationErrors[`${redirect.type}-${redirect.id}-backup`] ? 'error' : ''}`}
                              />
                              {urlValidationErrors[`${redirect.type}-${redirect.id}-backup`] && (
                                <div className="url-validation-error">
                                  {urlValidationErrors[`${redirect.type}-${redirect.id}-backup`]}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="edit-actions">
                          <button
                            onClick={() => handleSaveEdit(redirect)}
                            className="button button-primary"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => handleCancelEdit(redirect)}
                            className="button"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="url-display-container">
                          <div className="url-display">
                            <label>iOS URL:</label>
                            <div className="url-value">{redirect.iosUrl || '—'}</div>
                          </div>
                          <div className="url-display">
                            <label>Android URL:</label>
                            <div className="url-value">{redirect.androidUrl || '—'}</div>
                          </div>
                          <div className="url-display">
                            <label>Other Devices URL:</label>
                            <div className="url-value">{redirect.backupUrl || '—'}</div>
                          </div>
                        </div>
                        <div className="row-actions">
                          <span className="edit">
                            <button
                              onClick={() => handleEditClick(redirect)}
                              className="button-link"
                            >
                              Edit
                            </button>
                          </span>
                          <span className="remove">
                            <button
                              onClick={() => redirect.type === 'page' ? 
                                removePageRedirect(redirect.id) : 
                                removeSlugRedirect(redirect.id)
                              }
                              className="button-link"
                            >
                              Remove
                            </button>
                          </span>
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <ToggleSwitch
                      enabled={redirect.enabled}
                      onChange={async (checked) => {
                        let updatedPageRedirects = [...pageRedirects];
                        let updatedSlugRedirects = [...slugRedirects];
                        const settings = {};

                        if (redirect.type === 'page') {
                          updatedPageRedirects = pageRedirects.map(r =>
                            r.id === redirect.id ? { ...r, enabled: checked } : r
                          );
                          setPageRedirects(updatedPageRedirects);
                          
                          // Prepare settings
                          updatedPageRedirects.forEach(r => {
                            settings[r.id] = {
                              ios_url: r.iosUrl,
                              android_url: r.androidUrl,
                              backup_url: r.backupUrl,
                              enabled: r.enabled
                            };
                          });
                          
                          slugRedirects.forEach(r => {
                            settings[r.slug] = {
                              ios_url: r.iosUrl,
                              android_url: r.androidUrl,
                              backup_url: r.backupUrl,
                              enabled: r.enabled
                            };
                          });
                        } else {
                          updatedSlugRedirects = slugRedirects.map(r =>
                            r.slug === redirect.id ? { ...r, enabled: checked } : r
                          );
                          setSlugRedirects(updatedSlugRedirects);
                          
                          // Prepare settings
                          pageRedirects.forEach(r => {
                            settings[r.id] = {
                              ios_url: r.iosUrl,
                              android_url: r.androidUrl,
                              backup_url: r.backupUrl,
                              enabled: r.enabled
                            };
                          });
                          
                          updatedSlugRedirects.forEach(r => {
                            settings[r.slug] = {
                              ios_url: r.iosUrl,
                              android_url: r.androidUrl,
                              backup_url: r.backupUrl,
                              enabled: r.enabled
                            };
                          });
                        }

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
                            setInitialData({
                              pageRedirects: updatedPageRedirects,
                              slugRedirects: updatedSlugRedirects
                            });
                            
                            setNotification({
                              message: `Redirect ${checked ? 'enabled' : 'disabled'} successfully!`,
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
                            message: `Error updating status: ${error.message}`,
                            type: 'error'
                          });
                          // Revert the state if save failed
                          if (redirect.type === 'page') {
                            setPageRedirects(pageRedirects);
                          } else {
                            setSlugRedirects(slugRedirects);
                          }
                        }
                      }}
                      small={true}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
};

export default DeviceRedirectSettings;
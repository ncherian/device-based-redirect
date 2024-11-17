import React, { useState, useEffect, useRef } from 'react';
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
    const [editingRedirects, setEditingRedirects] = useState({});
    const [editingValues, setEditingValues] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [bulkAction, setBulkAction] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

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
        
        debugSavedData();
    };

    loadSavedSettings();
  }, []);

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
};

const handleSlugRedirectChange = (slug, field, value) => {
    const updated = slugRedirects.map(r =>
        r.slug === slug ? { ...r, [field]: value } : r
    );
    setSlugRedirects(updated);
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
      ios: /^https?:\/\/[a-zA-Z0-9-._~:/?#\[\]@!$&'()*+,;=%.]+$/,
      android: /^https?:\/\/[a-zA-Z0-9-._~:/?#\[\]@!$&'()*+,;=%.]+$/,
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
    
    // Clear any error as soon as user types
    setError({ type: '', message: '' });
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
  return 'Please enter a valid URL (starting with http:// or https://)';
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

const getAllRedirects = () => {
  const pageRedirectsWithType = pageRedirects.map(redirect => {
    const page = deviceRedirectData.pages.find(p => p.value.toString() === redirect.id.toString());
    const pageSlug = page?.slug || redirect.id;
    
    return {
      ...redirect,
      type: 'page',
      displayTitle: redirect.title,  // Store the title separately
      displayUrl: `${deviceRedirectData.homeUrl}/${pageSlug}`  // Use same URL format for both types
    };
  });
  
  const slugRedirectsWithType = slugRedirects.map(redirect => ({
    ...redirect,
    type: 'custom',
    displayTitle: redirect.slug,  // Use slug as title
    displayUrl: `${deviceRedirectData.homeUrl}/${redirect.slug}`,
    id: redirect.slug
  }));
  
  let allRedirects = [...pageRedirectsWithType, ...slugRedirectsWithType];
  
  if (typeFilter !== 'all') {
    allRedirects = allRedirects.filter(redirect => redirect.type === typeFilter);
  }
  
  return allRedirects;
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
  
  // Validate URLs
  let hasValidationErrors = false;
  const newValidationErrors = { ...urlValidationErrors };

  // Validate iOS URL
  if (editedValues.iosUrl && !validateUrl(editedValues.iosUrl, 'ios')) {
    newValidationErrors[`${redirect.type}-${redirect.id}-ios`] = 'Invalid App Store URL format';
    hasValidationErrors = true;
  } else {
    delete newValidationErrors[`${redirect.type}-${redirect.id}-ios`];
  }

  // Validate Android URL
  if (editedValues.androidUrl && !validateUrl(editedValues.androidUrl, 'android')) {
    newValidationErrors[`${redirect.type}-${redirect.id}-android`] = 'Invalid Play Store URL format';
    hasValidationErrors = true;
  } else {
    delete newValidationErrors[`${redirect.type}-${redirect.id}-android`];
  }

  // Validate Backup URL
  if (editedValues.backupUrl && !validateUrl(editedValues.backupUrl, 'backup')) {
    newValidationErrors[`${redirect.type}-${redirect.id}-backup`] = 'Invalid URL format';
    hasValidationErrors = true;
  } else {
    delete newValidationErrors[`${redirect.type}-${redirect.id}-backup`];
  }

  // Update validation errors state
  setUrlValidationErrors(newValidationErrors);

  // If there are validation errors, don't proceed with save
  if (hasValidationErrors) {
    return;
  }

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
      // Close edit mode
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

const handleSelectAll = (e) => {
  setSelectAll(e.target.checked);
  if (e.target.checked) {
    setSelectedItems(getAllRedirects().map(redirect => redirect.id));
  } else {
    setSelectedItems([]);
  }
};

const handleSelectItem = (id) => {
  setSelectedItems(prev => {
    if (prev.includes(id)) {
      return prev.filter(item => item !== id);
    } else {
      return [...prev, id];
    }
  });
};

const handleBulkAction = async (action) => {
  if (!selectedItems.length) {
    setNotification({
      message: 'Please select items to perform bulk action',
      type: 'error'
    });
    return;
  }

  let confirmMessage = '';
  switch(action) {
    case 'delete':
      confirmMessage = 'Are you sure you want to delete all selected redirects?';
      break;
    case 'enable':
      confirmMessage = 'Are you sure you want to enable all selected redirects?';
      break;
    case 'disable':
      confirmMessage = 'Are you sure you want to disable all selected redirects?';
      break;
    default:
      return;
  }

  if (!window.confirm(confirmMessage)) {
    return;
  }

  const settings = {};
  let updatedPageRedirects = [...pageRedirects];
  let updatedSlugRedirects = [...slugRedirects];

  if (action === 'delete') {
    updatedPageRedirects = pageRedirects.filter(r => !selectedItems.includes(r.id));
    updatedSlugRedirects = slugRedirects.filter(r => !selectedItems.includes(r.slug));
  } else {
    updatedPageRedirects = pageRedirects.map(r => 
      selectedItems.includes(r.id) ? { ...r, enabled: action === 'enable' } : r
    );
    updatedSlugRedirects = slugRedirects.map(r => 
      selectedItems.includes(r.slug) ? { ...r, enabled: action === 'enable' } : r
    );
  }

  // Prepare settings object
  updatedPageRedirects.forEach(r => {
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
      setSlugRedirects(updatedSlugRedirects);
      setSelectedItems([]);
      setSelectAll(false);

      const actionText = action === 'delete' ? 'deleted' : 
                        action === 'enable' ? 'enabled' : 'disabled';
      
      setNotification({
        message: `Selected redirects ${actionText} successfully!`,
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
      message: `Error performing bulk action: ${error.message}`,
      type: 'error'
    });
  }
};

  return (
    <div className="wrap">
      <h1>Device-Based Redirects</h1>
      
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
        {/* Sidebar Section */}
        <div className="sidebar-section">
          {/* Combined Add Redirect Section */}
          <div className="section">
            <h2>Add New Redirect</h2>
            
            {/* Page Redirect */}
            <div className="add-new">
              <label>Page Redirect</label>
              <select
                value={selectedPage}
                onChange={(e) => {
                  setSelectedPage(e.target.value);
                  // Clear any error when selection changes
                  setError({ type: '', message: '' });
                }}
              >
                <option value="">Select a page</option>
                {deviceRedirectData.pages.map(page => (
                  <option key={page.value} value={page.value}>{page.label}</option>
                ))}
              </select>
              <button onClick={handleAddPageRedirect} className="button button-primary">
                Add Page Redirect
              </button>
              {error.type === 'page' && (
                <div className="error-message">{error.message}</div>
              )}
            </div>

            <div className="section-divider">
              <span>OR</span>
            </div>

            {/* Custom URL Redirect */}
            <div className="add-new">
              <label>Custom URL Redirect</label>
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
              {error.type === 'slug' && (
                <div className="error-message">{error.message}</div>
              )}
            </div>
          </div>

          {/* Coffee Section */}
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

        {/* Main Content Section */}
        <div className="main-content">
            <div className="tablenav top">
              <div className="alignleft actions bulkactions">
                <select 
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="">Bulk Actions</option>
                  <option value="delete">Delete</option>
                  <option value="enable">Enable</option>
                  <option value="disable">Disable</option>
                </select>
                <button 
                  className="button action" 
                  onClick={() => {
                    if (bulkAction) {
                      handleBulkAction(bulkAction);
                      setBulkAction('');
                    }
                  }}
                >
                  Apply
                </button>
              </div>
              <div className="alignleft actions">
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setSelectedItems([]); // Clear selections when filter changes
                    setSelectAll(false);
                  }}
                  className="filter-by-type"
                >
                  <option value="all">All Types</option>
                  <option value="page">Page Redirects</option>
                  <option value="custom">Custom URLs</option>
                </select>
              </div>
              {selectedItems.length > 0 && (
                <div className="alignleft actions">
                  <span className="displaying-num">
                    {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}
            </div>
            <table className="wp-list-table widefat fixed striped">
              <thead>
                <tr>
                  <td className="manage-column column-cb check-column">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                    />
                  </td>
                  <th>Page/Custom URL</th>
                  <th>Type</th>
                  <th>Redirected URLs</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {getAllRedirects().map(redirect => (
                  <tr key={redirect.id}>
                    <th scope="row" className="check-column">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(redirect.id)}
                        onChange={() => handleSelectItem(redirect.id)}
                      />
                    </th>
                    <td data-label="Page/Custom URL">
                      <div className="page-url-container">
                        <div className="page-title">{redirect.displayTitle}</div>
                        <a 
                          href={redirect.displayUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="page-url"
                        >
                          {redirect.displayUrl}
                        </a>
                      </div>
                    </td>
                    <td data-label="Type">
                      <span className={`redirect-type ${redirect.type}`}>
                        {redirect.type === 'page' ? 'Page Redirect' : 'Custom URL'}
                      </span>
                    </td>
                    <td data-label="Redirected URLs" className="url-actions-cell">
                      {editingRedirects[redirect.id] ? (
                        <>
                          <div className="url-fields-container">
                            <div className="url-field">
                              <label>iOS URL:</label>
                              <div className="url-input-container">
                                <input
                                  type="url"
                                  value={editingValues[redirect.id].iosUrl}
                                  onChange={(e) => {
                                    setEditingValues(prev => ({
                                      ...prev,
                                      [redirect.id]: {
                                        ...prev[redirect.id],
                                        iosUrl: e.target.value
                                      }
                                    }));
                                    // Clear validation error for this field
                                    setUrlValidationErrors(prev => {
                                      const newErrors = { ...prev };
                                      delete newErrors[`${redirect.type}-${redirect.id}-ios`];
                                      return newErrors;
                                    });
                                  }}
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
                                  onChange={(e) => {
                                    setEditingValues(prev => ({
                                      ...prev,
                                      [redirect.id]: {
                                        ...prev[redirect.id],
                                        androidUrl: e.target.value
                                      }
                                    }));
                                    // Clear validation error for this field
                                    setUrlValidationErrors(prev => {
                                      const newErrors = { ...prev };
                                      delete newErrors[`${redirect.type}-${redirect.id}-android`];
                                      return newErrors;
                                    });
                                  }}
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
                                  onChange={(e) => {
                                    setEditingValues(prev => ({
                                      ...prev,
                                      [redirect.id]: {
                                        ...prev[redirect.id],
                                        backupUrl: e.target.value
                                      }
                                    }));
                                    // Clear validation error for this field
                                    setUrlValidationErrors(prev => {
                                      const newErrors = { ...prev };
                                      delete newErrors[`${redirect.type}-${redirect.id}-backup`];
                                      return newErrors;
                                    });
                                  }}
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
                              <div className="url-value">
                                {redirect.iosUrl ? (
                                  <a href={redirect.iosUrl} target="_blank" rel="noopener noreferrer">
                                    {redirect.iosUrl}
                                  </a>
                                ) : '—'}
                              </div>
                            </div>
                            <div className="url-display">
                              <label>Android URL:</label>
                              <div className="url-value">
                                {redirect.androidUrl ? (
                                  <a href={redirect.androidUrl} target="_blank" rel="noopener noreferrer">
                                    {redirect.androidUrl}
                                  </a>
                                ) : '—'}
                              </div>
                            </div>
                            <div className="url-display">
                              <label>Other Devices URL:</label>
                              <div className="url-value">
                                {redirect.backupUrl ? (
                                  <a href={redirect.backupUrl} target="_blank" rel="noopener noreferrer">
                                    {redirect.backupUrl}
                                  </a>
                                ) : '—'}
                              </div>
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
                    <td data-label="Status">
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
            <div className="tablenav bottom">
              <div className="alignleft actions bulkactions">
                <select 
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value)}
                >
                  <option value="">Bulk Actions</option>
                  <option value="delete">Delete</option>
                  <option value="enable">Enable</option>
                  <option value="disable">Disable</option>
                </select>
                <button 
                  className="button action" 
                  onClick={() => {
                    if (bulkAction) {
                      handleBulkAction(bulkAction);
                      setBulkAction('');
                    }
                  }}
                >
                  Apply
                </button>
              </div>
              {selectedItems.length > 0 && (
                <div className="alignleft actions">
                  <span className="displaying-num">
                    {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceRedirectSettings;
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
    // Get initial type and page from URL
    const params = new URLSearchParams(window.location.search);
    const initialType = params.get('type') || 'all';
    const initialPage = parseInt(params.get('page_num')) || 1;
    // State variables
    const [pageRedirects, setPageRedirects] = useState([]);
    const [slugRedirects, setSlugRedirects] = useState([]);
    const [selectedPage, setSelectedPage] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [error, setError] = useState({ type: '', message: '' });
    const [notification, setNotification] = useState(null);
    const [urlValidationErrors, setUrlValidationErrors] = useState({});
    const [editingRedirects, setEditingRedirects] = useState({});
    const [editingValues, setEditingValues] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [bulkAction, setBulkAction] = useState('');
    const [typeFilter, setTypeFilter] = useState(initialType);

    const [addRedirectType, setAddRedirectType] = useState('page');
    const [newRedirectUrls, setNewRedirectUrls] = useState({
      iosUrl: '',
      androidUrl: '',
      backupUrl: ''
    });
    const [formNotification, setFormNotification] = useState(null);
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [perPage, setPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [redirects, setRedirects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      // Clear selections when changing pages
      setSelectedItems([]);
      setSelectAll(false);
      loadRedirects();
    }, [currentPage, perPage, typeFilter]);

    const loadRedirects = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${deviceRedirectData.restUrl}device-redirect/v1/redirects?` + 
          new URLSearchParams({
            page: currentPage,
            per_page: perPage,
            type: typeFilter,
          }),
          {
            headers: {
              'X-WP-Nonce': deviceRedirectData.restNonce
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load redirects');
        }
        const data = await response.json();
        setRedirects(data.items);
        setTotalPages(data.pages);
        setTotalItems(data.total);

        // Update selectAll based on whether all visible items are selected
        if (data.items.length > 0) {
          const allCurrentItemsSelected = data.items.every(item => 
            selectedItems.includes(item.id)
          );
          setSelectAll(allCurrentItemsSelected);
        }
      } catch (error) {
        setNotification({
          message: `Error loading redirects: ${error.message}`,
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };


    const removeRedirect = async (redirect) => {
      if (window.confirm('Are you sure you want to remove this redirect?')) {
          try {
              const response = await fetch(
                  `${deviceRedirectData.restUrl}device-redirect/v1/delete`,
                  {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'X-WP-Nonce': deviceRedirectData.restNonce
                      },
                      body: JSON.stringify({
                          items: [{
                              id: redirect.id,
                              reference_id: redirect.reference_id,
                              type: redirect.type
                          }]
                      })
                  }
              );
              
              const data = await response.json();
              
              if (response.ok) {
                  await loadRedirects();
                  setNotification({
                      message: 'Redirect removed successfully!',
                      type: 'success'
                  });
                  
                  setTimeout(() => {
                      setNotification(null);
                  }, 5000);
              } else {
                  throw new Error(data.message || 'Remove failed');
              }
          } catch (error) {
              setNotification({
                  message: `Error removing redirect: ${error.message}`,
                  type: 'error'
              });
          }
      }
  };


    const handleAddPageRedirect = async () => {
      // 1. First check if page is selected
      if (!selectedPage) {
          setError({ type: 'page', message: 'Please select a page' });
          return;
      }
      
      try {
          // 2. Check if page already exists using the new endpoint
          const checkResult = await checkExistingEntry('page', selectedPage);
          
          if (checkResult.exists) {
              setError({ type: 'page', message: 'This page already has a redirect!' });
              return;
          }

          // 3. Then validate URLs
          const urlErrors = validateNewUrls();
          if (Object.keys(urlErrors).length > 0) {
              setUrlValidationErrors(urlErrors);
              return;
          }

          // 4. Save the new redirect
          const settings = {
              [selectedPage]: {
                  type: 'page',
                  ios_url: newRedirectUrls.iosUrl,
                  android_url: newRedirectUrls.androidUrl,
                  backup_url: newRedirectUrls.backupUrl,
                  enabled: true
              }
          };

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
              // Reset form
              setSelectedPage('');
              setError({ type: '', message: '' });
              setNewRedirectUrls({ iosUrl: '', androidUrl: '', backupUrl: '' });
              
              // Use the reset function
              await resetAndReload();
              
              setFormNotification({
                  message: 'Page redirect added successfully!',
                  type: 'success'
              });
              
              setNotification({
                  message: 'Page redirect added successfully!',
                  type: 'success'
              });
              
              setTimeout(() => {
                  setNotification(null);
                  setFormNotification(null);
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
    
    const handleAddSlugRedirect = async () => {
      // 1. First check if slug is entered
      if (!newSlug) {
          setError({ type: 'slug', message: 'Please enter a custom slug' });
          return;
      }
      
      // 2. Clean the slug
      const cleanSlug = newSlug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      
      try {
          // 3. Check if slug already exists using the new endpoint
          const checkResult = await checkExistingEntry('custom', cleanSlug);
          
          if (checkResult.exists) {
              setError({ type: 'slug', message: 'This slug has already been added!' });
              return;
          }

          // 4. Validate slug against WordPress pages/posts
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

          // 5. Only now validate URLs after we know the slug is valid
          const urlErrors = validateNewUrls();
          if (Object.keys(urlErrors).length > 0) {
              setUrlValidationErrors(urlErrors);
              return;
          }

          const newRedirect = {
              slug: cleanSlug,
              iosUrl: newRedirectUrls.iosUrl,
              androidUrl: newRedirectUrls.androidUrl,
              backupUrl: newRedirectUrls.backupUrl,
              enabled: true
          };

          const updatedSlugRedirects = [...slugRedirects, newRedirect];

          // Prepare settings for save
          const settings = {};
          pageRedirects.forEach(redirect => {
              settings[redirect.id] = {
                  type: 'custom',
                  ios_url: redirect.iosUrl,
                  android_url: redirect.androidUrl,
                  backup_url: redirect.backupUrl,
                  enabled: redirect.enabled
              };
          });
          
          updatedSlugRedirects.forEach(redirect => {
              settings[redirect.slug] = {
                  type: 'custom',
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
              // Reset form
              setNewSlug('');
              setError({ type: '', message: '' });
              setNewRedirectUrls({ iosUrl: '', androidUrl: '', backupUrl: '' });
              
              // Use the new reset function
              await resetAndReload();
              
              setFormNotification({
                  message: 'Custom URL redirect added successfully!',
                  type: 'success'
              });
              
              setNotification({
                  message: 'Custom URL redirect added successfully!',
                  type: 'success'
              });
              
              setTimeout(() => {
                  setNotification(null);
                  setFormNotification(null);
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
      newValidationErrors[`${redirect.type}-${redirect.id}-ios`] = 'Invalid URL format';
      hasValidationErrors = true;
    } else {
      delete newValidationErrors[`${redirect.type}-${redirect.id}-ios`];
    }

    // Validate Android URL
    if (editedValues.androidUrl && !validateUrl(editedValues.androidUrl, 'android')) {
      newValidationErrors[`${redirect.type}-${redirect.id}-android`] = 'Invalid URL format';
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

    setUrlValidationErrors(newValidationErrors);

    if (hasValidationErrors) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append('action', 'save_device_redirect_settings');
      formData.append('nonce', deviceRedirectData.nonce);
      
      // Create settings object with just the edited redirect
      const settings = {
        [redirect.reference_id]: {
          type: redirect.type,
          ios_url: editedValues.iosUrl,
          android_url: editedValues.androidUrl,
          backup_url: editedValues.backupUrl,
          enabled: redirect.enabled
        }
      };

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

        // Reload the current page of redirects
        await loadRedirects();

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
      // Add only current page items that aren't already selected
      const currentPageIds = redirects.map(redirect => redirect.id);
      const newSelectedItems = [...new Set([...selectedItems, ...currentPageIds])];
      setSelectedItems(newSelectedItems);
    } else {
      // Remove only current page items from selection
      const currentPageIds = redirects.map(redirect => redirect.id);
      setSelectedItems(prev => prev.filter(id => !currentPageIds.includes(id)));
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

      try {
          // Get the selected redirects from current page
          const selectedRedirects = redirects.filter(r => selectedItems.includes(r.id));
          
          if (action === 'delete') {
              const response = await fetch(
                  `${deviceRedirectData.restUrl}device-redirect/v1/delete`,
                  {
                      method: 'POST',
                      headers: {
                          'Content-Type': 'application/json',
                          'X-WP-Nonce': deviceRedirectData.restNonce
                      },
                      body: JSON.stringify({
                          items: selectedRedirects.map(r => ({
                              id: r.id,
                              reference_id: r.reference_id,
                              type: r.type
                          }))
                      })
                  }
              );
              
              const data = await response.json();
              
              if (!response.ok) {
                  throw new Error(data.message || 'Delete failed');
              }

              setSelectedItems([]);
              setSelectAll(false);
              await loadRedirects();

              setNotification({
                  message: `${selectedRedirects.length} redirects deleted successfully!`,
                  type: 'success'
              });
              
              setTimeout(() => {
                  setNotification(null);
              }, 5000);
          } else {
              // Existing code for enable/disable actions
              const settings = {};
              selectedRedirects.forEach(redirect => {
                  settings[redirect.reference_id] = {
                      type: redirect.type,
                      ios_url: redirect.iosUrl,
                      android_url: redirect.androidUrl,
                      backup_url: redirect.backupUrl,
                      enabled: action === 'enable'
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
                  // Reset selections and reload
                  setSelectedItems([]);
                  setSelectAll(false);
                  await loadRedirects();

                  const actionText = action === 'delete' ? 'deleted' : 
                                  action === 'enable' ? 'enabled' : 'disabled';
                  
                  setNotification({
                      message: `${selectedRedirects.length} redirects ${actionText} successfully!`,
                      type: 'success'
                  });
                  
                  setTimeout(() => {
                      setNotification(null);
                  }, 5000);
              } else {
                  throw new Error(data.data || 'Save failed');
              }
          }
      } catch (error) {
          console.error('Bulk action error:', error);
          setNotification({
              message: `Error performing bulk action: ${error.message}`,
              type: 'error'
          });
      }
  };

  // Update the validation for new redirects
  const validateNewUrls = () => {
    const errors = {};
    
    // Check if at least one store URL is provided
    if (!newRedirectUrls.iosUrl && !newRedirectUrls.androidUrl) {
      errors.general = 'Please enter at least one URL (iOS or Android)';
    }
    
    if (newRedirectUrls.iosUrl && !validateUrl(newRedirectUrls.iosUrl, 'ios')) {
      errors.ios = 'Please enter a valid URL';
    }
    if (newRedirectUrls.androidUrl && !validateUrl(newRedirectUrls.androidUrl, 'android')) {
      errors.android = 'Please enter a valid URL';
    }
    if (newRedirectUrls.backupUrl && !validateUrl(newRedirectUrls.backupUrl, 'backup')) {
      errors.backup = 'Please enter a valid URL';
    }
    
    return errors;
  };

  // New function to handle resetting and reloading
  const resetAndReload = async () => {
      // First remove the typeFilter from useEffect dependencies
      // to prevent double loading
      const currentFilter = typeFilter;
      updateURL(1, 'all');
      setTypeFilter('all');
      setCurrentPage(1);
      if(currentFilter == 'all' && currentPage == 1){
      // Manually load with reset values
        try {
            setLoading(true);
            const response = await fetch(
                `${deviceRedirectData.restUrl}device-redirect/v1/redirects?` + 
                new URLSearchParams({
                    page: 1,
                    per_page: perPage,
                    type: 'all',
                }),
                {
                    headers: {
                        'X-WP-Nonce': deviceRedirectData.restNonce
                    }
                }
            );

            if (!response.ok) {
                throw new Error('Failed to load redirects');
            }

            const data = await response.json();
            setRedirects(data.items);
            setTotalPages(data.pages);
            setTotalItems(data.total);
        } catch (error) {
            setNotification({
                message: `Error loading redirects: ${error.message}`,
                type: 'error'
            });
            // Restore previous filter if load fails
            setTypeFilter(currentFilter);
        } finally {
            setLoading(false);
        }
      }
  };

  const updateURL = (page, type) => {
    const params = new URLSearchParams(window.location.search);
    
    if (page !== 1) {
        params.set('page_num', page);
    } else {
        params.delete('page_num');
    }
    
    if (type !== 'all') {
        params.set('type', type);
    } else {
        params.delete('type');
    }

    // Update URL without reloading the page
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.pushState({}, '', newUrl);
  };

  // Function to check if an entry already exists
  const checkExistingEntry = async (type, referenceId) => {
      try {
          const response = await fetch(
              `${deviceRedirectData.restUrl}device-redirect/v1/entry?` + 
              new URLSearchParams({
                  type: type,
                  reference_id: referenceId,
              }),
              {
                  headers: {
                      'X-WP-Nonce': deviceRedirectData.restNonce
                  }
              }
          );

          if (!response.ok) {
              throw new Error('Failed to check existing entry');
          }

          const data = await response.json();
          return data;
      } catch (error) {
          console.error('Error checking existing entry:', error);
          throw error;
      }
  };

// Smooth scroll function that tries multiple WordPress admin selectors
const smoothScrollToTop = () => {
  // Try all possible WordPress admin containers
  const wpBody = document.getElementById('wpbody-content');
  const wpContent = document.getElementById('wpcontent');
  
  const scrollOptions = {
      top: 0,
      behavior: 'smooth'
  };

  // Try different methods to ensure scrolling works
  if (wpBody) {
      wpBody.scrollTo(scrollOptions);
      wpBody.parentElement.scrollTo(scrollOptions);
  }
  
  if (wpContent) {
      wpContent.scrollTo(scrollOptions);
  }

  // Fallback methods
  if (window.jQuery) {
      jQuery([
          'html, body',
          '#wpbody-content',
          '#wpcontent',
          '.wrap'
      ].join(', ')).animate({ scrollTop: 0 }, 500);
  } else {
      // Pure JS fallback
      document.documentElement.scrollTo(scrollOptions);
      document.body.scrollTo(scrollOptions);
      window.scrollTo(scrollOptions);
  }
};

// Function to handle pagination changes with forced scroll
const handlePaginationChange = (newPage) => {
  // Update state and URL
  setCurrentPage(newPage);
  updateURL(newPage, typeFilter);
  
  // Try multiple times with increasing delays
  //setTimeout(smoothScrollToTop, 50);
  setTimeout(smoothScrollToTop, 100);
  //setTimeout(smoothScrollToTop, 300);
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
              
              <div className="redirect-type-selector">
                <button 
                  className={`redirect-type-button ${addRedirectType === 'page' ? 'active' : ''}`}
                  onClick={() => setAddRedirectType('page')}
                >
                  Page Redirect
                </button>
                <button 
                  className={`redirect-type-button ${addRedirectType === 'custom' ? 'active' : ''}`}
                  onClick={() => setAddRedirectType('custom')}
                >
                  Custom URL
                </button>
              </div>

              {formNotification && (
                <div className={`form-notification notice notice-${formNotification.type}`}>
                  <p>{formNotification.message}</p>
                </div>
              )}

              {addRedirectType === 'page' ? (
                <div className="add-new">
                  <select
                    value={selectedPage}
                    onChange={(e) => {
                      setSelectedPage(e.target.value);
                      setError({ type: '', message: '' });
                    }}
                  >
                    <option value="">Select a page</option>
                    {deviceRedirectData.pages.map(page => (
                      <option key={page.value} value={page.value}>{page.label}</option>
                    ))}
                  </select>
                  
                  <div className="url-fields-container">
                    <div className="url-field">
                      <label>iOS URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.iosUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, iosUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.ios;
                              delete newErrors.general;
                              return newErrors;
                            });
                          }}
                          placeholder="https://apps.apple.com/..."
                          className={`regular-text ${urlValidationErrors.ios ? 'error' : ''}`}
                        />
                        {urlValidationErrors.ios && (
                          <div className="url-validation-error">{urlValidationErrors.ios}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="url-field">
                      <label>Android URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.androidUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, androidUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.android;
                              delete newErrors.general;
                              return newErrors;
                            });
                          }}
                          placeholder="https://play.google.com/..."
                          className={`regular-text ${urlValidationErrors.android ? 'error' : ''}`}
                        />
                        {urlValidationErrors.android && (
                          <div className="url-validation-error">{urlValidationErrors.android}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="url-field">
                      <label>Other Devices URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.backupUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, backupUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.backup;
                              return newErrors;
                            });
                          }}
                          placeholder="https://..."
                          className={`regular-text ${urlValidationErrors.backup ? 'error' : ''}`}
                        />
                        {urlValidationErrors.backup && (
                          <div className="url-validation-error">{urlValidationErrors.backup}</div>
                        )}
                      </div>
                    </div>
                    {urlValidationErrors.general && (
                      <div className="error-message">{urlValidationErrors.general}</div>
                    )}
                  </div>

                  <button onClick={handleAddPageRedirect} className="button button-primary">
                    Add Page Redirect
                  </button>
                  {error.type === 'page' && (
                    <div className="error-message">{error.message}</div>
                  )}
                </div>
              ) : (
                <div className="add-new">
                  <div className="slug-input-section">
                    <label>Custom URL Slug</label>
                    <input
                      type="text"
                      value={newSlug}
                      onChange={handleSlugChange}
                      placeholder="Enter slug"
                      className="regular-text"
                    />
                    {newSlug && (
                      <div className="slug-preview">
                        {deviceRedirectData.homeUrl}/{newSlug}
                      </div>
                    )}
                  </div>
                  {error.type === 'slug' && (
                    <div className="error-message">{error.message}</div>
                  )}
                  
                  <div className="url-fields-container">
                    <div className="url-field">
                      <label>iOS URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.iosUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, iosUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.ios;
                              delete newErrors.general;
                              return newErrors;
                            });
                          }}
                          placeholder="https://apps.apple.com/..."
                          className={`regular-text ${urlValidationErrors.ios ? 'error' : ''}`}
                        />
                        {urlValidationErrors.ios && (
                          <div className="url-validation-error">{urlValidationErrors.ios}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="url-field">
                      <label>Android URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.androidUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, androidUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.android;
                              delete newErrors.general;
                              return newErrors;
                            });
                          }}
                          placeholder="https://play.google.com/..."
                          className={`regular-text ${urlValidationErrors.android ? 'error' : ''}`}
                        />
                        {urlValidationErrors.android && (
                          <div className="url-validation-error">{urlValidationErrors.android}</div>
                        )}
                      </div>
                    </div>
                    
                    <div className="url-field">
                      <label>Other Devices URL:</label>
                      <div className="url-input-container">
                        <input
                          type="url"
                          value={newRedirectUrls.backupUrl}
                          onChange={(e) => {
                            setNewRedirectUrls(prev => ({ ...prev, backupUrl: e.target.value }));
                            setUrlValidationErrors(prev => {
                              const newErrors = { ...prev };
                              delete newErrors.backup;
                              return newErrors;
                            });
                          }}
                          placeholder="https://..."
                          className={`regular-text ${urlValidationErrors.backup ? 'error' : ''}`}
                        />
                        {urlValidationErrors.backup && (
                          <div className="url-validation-error">{urlValidationErrors.backup}</div>
                        )}
                      </div>
                    </div>
                    {urlValidationErrors.general && (
                      <div className="error-message">{urlValidationErrors.general}</div>
                    )}
                  </div>

                  <button 
                    onClick={handleAddSlugRedirect} 
                    className="button button-primary"
                  >
                    Add URL Redirect
                  </button>
                </div>
              )}
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
                    src={deviceRedirectData.pluginUrl + '/assets/bmc.png'}
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
                      const newType = e.target.value;
                      setTypeFilter(newType);
                      setCurrentPage(1); // Rese
                      updateURL(1, newType);
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
                  {loading ? (
                      <tr>
                          <td colSpan="5" className="loading-row">
                              Loading...
                          </td>
                      </tr>
                  ) : redirects.map(redirect => (
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
                                <label>iOS:</label>
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
                                <label>Android:</label>
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
                                <label>Other Devices:</label>
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
                                <span className="url-icon" title="iOS URL">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                                  </svg>
                                </span>
                                <div className="url-value single-line">
                                  {redirect.iosUrl ? (
                                    <a 
                                      href={redirect.iosUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      title={redirect.iosUrl}
                                    >
                                      {redirect.iosUrl}
                                    </a>
                                  ) : '—'}
                                </div>
                              </div>
                              <div className="url-display">
                                <span className="url-icon" title="Android URL">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
                                  </svg>
                                </span>
                                <div className="url-value single-line">
                                  {redirect.androidUrl ? (
                                    <a 
                                      href={redirect.androidUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      title={redirect.androidUrl}
                                    >
                                      {redirect.androidUrl}
                                    </a>
                                  ) : '—'}
                                </div>
                              </div>
                              <div className="url-display">
                                <span className="url-icon" title="Other Devices URL">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 4H4C2.89543 4 2 4.89543 2 6V16C2 17.1046 2.89543 18 4 18H20C21.1046 18 22 17.1046 22 16V6C22 4.89543 21.1046 4 20 4Z"/>
                                    <path d="M15 19C15 19.5523 12.5 20 12 20C11.5 20 9 19.5523 9 19H15Z"/>
                                  </svg>
                                </span>
                                <div className="url-value single-line">
                                  {redirect.backupUrl ? (
                                    <a 
                                      href={redirect.backupUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      title={redirect.backupUrl}
                                    >
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
                                  onClick={() => removeRedirect(redirect)}
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
                            try {
                              const settings = {
                                [redirect.reference_id]: {
                                  type: redirect.type,
                                  ios_url: redirect.iosUrl,
                                  android_url: redirect.androidUrl,
                                  backup_url: redirect.backupUrl,
                                  enabled: checked
                                }
                              };

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
                                // Reload the current page to get updated data
                                await loadRedirects();

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
                              // No need to revert state manually as we're using loadRedirects
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
                <div className="tablenav-pages">
                  <span className="displaying-num">
                    {totalItems} items
                  </span>
                  <span className="pagination-links">
                    <button
                      className="first-page button"
                      onClick={() => handlePaginationChange(1)}
                      disabled={currentPage === 1}
                    >
                      «
                    </button>
                    <button
                      className="prev-page button"
                      onClick={() => handlePaginationChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      ‹
                    </button>
                    <span className="paging-input">
                      <span className="tablenav-paging-text">
                        {currentPage} of <span className="total-pages">{totalPages}</span>
                      </span>
                    </span>
                    <button
                      className="next-page button"
                      onClick={() => handlePaginationChange(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      ›
                    </button>
                    <button
                      className="last-page button"
                      onClick={() => handlePaginationChange(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      »
                    </button>
                  </span>
                </div>
              </div>
          </div>
        </div>
      </div>
    );
  };

  export default DeviceRedirectSettings;
const appHelper = {
  // Always point to the live backend. The previous logic returned an
  // empty base URL when the page was opened via file:// or localhost,
  // which caused requests to resolve to relative/local paths instead of
  // the real API — so no response was ever received.
  getBaseUrl: () => {
    return 'https://hipk.onrender.com/api';
  },
  getUrl: (path) => {
    const baseUrl = appHelper.getBaseUrl();
    return `${baseUrl}/${path.replace(/^\//, '')}`;
  },

  /**
   * Display a toast notification
   * @param {string} msg
   * @param {'Success' | 'Error' | 'Info'} type
   */
  showToast: (msg, type = 'Info') => {
    // Check if toast container exists, if not create one
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      });
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const isError = type === 'Error';
    const isSuccess = type === 'Success';

    let icon = 'fa-info-circle';
    let bgColor = 'var(--surface-color)';
    let color = 'var(--text-primary)';
    let borderColor = 'var(--surface-color-light)';

    if (isError) {
      icon = 'fa-triangle-exclamation';
      color = '#ef4444'; // Red
      borderColor = '#ef4444';
    } else if (isSuccess) {
      icon = 'fa-check-circle';
      color = '#10b981'; // Green
      borderColor = '#10b981';
    }

    Object.assign(toast.style, {
      background: bgColor,
      color: 'var(--text-primary)',
      padding: '12px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '14px',
      fontWeight: '500',
      borderLeft: `4px solid ${borderColor}`,
      opacity: '0',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      transform: 'translateY(20px)',
    });

    toast.innerHTML = `<i class="fa-solid ${icon}" style="color: ${color}; font-size: 16px;"></i><span>${msg}</span>`;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    // Animate out
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /**
   * Check if backend system is live (Health Check)
   */
  isSystemLive: async () => {
    try {
      const url = appHelper.getUrl('auth/health-check');
      const response = await axios.get(url);
      const data = response.data;
      if (data.database === 'disconnected') {
        return { available: false, error: 'Database is down' };
      }
      return { available: true, error: null };
    } catch (e) {
      return { available: false, error: 'Backend server is unreachable.' };
    }
  },

  /**
   * Wrapper for API requests that handles tokens and JSON parsing
   */
  request: async (path, options = {}) => {
    const url = appHelper.getUrl(path);
    const token = localStorage.getItem('hibiz_token');

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      // Use Axios for requests as requested
      const response = await axios({
        url: url,
        method: options.method || 'GET',
        headers: headers,
        data: options.body ? JSON.parse(options.body) : undefined,
      });

      return response.data;
    } catch (error) {
      // Handle 401 Unauthorized
      if (error.response && error.response.status === 401) {
        localStorage.removeItem('hibiz_token');
        localStorage.removeItem('hibiz_user_role');
        window.location.href = 'login.html';
        throw new Error('Session expired. Please login again.');
      }

      // Network error (no response at all) — most commonly CORS being
      // blocked by the browser, DNS/connectivity issues, or the backend
      // being asleep (Render free-tier services spin down and take a
      // few seconds to wake on the first request).
      if (!error.response) {
        console.error(`API Network Error [${path}]:`, error);
        throw new Error(
          'Could not reach the server. It may be waking up (Render free tier) or blocked by CORS — check the browser console for details.'
        );
      }

      console.error(`API Request Error [${path}]:`, error);
      throw new Error(error.response?.data?.message || error.message || 'Request failed');
    }
  },
};

window.appHelper = appHelper;

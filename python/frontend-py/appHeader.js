/**
 * Renders the global application header dynamically.
 * Replicates behavior of AppHeader.tsx.
 *
 * @param {Object} options
 * @param {boolean} options.showUserMenu - Whether to show the role badge and logout button (e.g. true for dashboard, false for login)
 * @param {string} options.title - Optional custom title
 */
window.renderAppHeader = async function (options = { showUserMenu: true }) {
  const existingHeader = document.getElementById('globalAppHeader');
  if (existingHeader) {
    existingHeader.remove();
  }

  const header = document.createElement('header');
  header.id = 'globalAppHeader';
  header.className = 'navbar glass';
  // Ensure the header sits at the top
  header.style.position = 'fixed';
  header.style.top = '0';
  header.style.left = '0';
  header.style.width = '100%';
  header.style.zIndex = '1000';

  // Need to adjust body padding to prevent content from hiding under the fixed header
  document.body.style.paddingTop = '60px';

  let titleHtml = options.title || 'HiBiz';

  // Build User Info / Right Actions section
  let rightSectionHtml = '';

  if (options.showUserMenu) {
    const role = localStorage.getItem('hibiz_user_role') || 'User';
    rightSectionHtml = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div id="systemStatusIndicator" style="display: flex; align-items: center; gap: 4px; font-size: 12px; margin-right: 8px;">
          <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--text-secondary);"></i>
        </div>
        <div id="roleBadge" class="role-badge">${role}</div>
        <button onclick="logout()" class="btn btn-glass" style="padding: 0.25rem 0.75rem;">
          <i class="fa-solid fa-right-from-bracket"></i> Logout
        </button>
      </div>
    `;
  } else {
    // Only show system status
    rightSectionHtml = `
      <div id="systemStatusIndicator" style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
        <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--text-secondary);"></i>
      </div>
    `;
  }

  header.innerHTML = `
    <div class="nav-brand" style="display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-cube"></i> ${titleHtml}
    </div>
    <div class="user-info">
      ${rightSectionHtml}
    </div>
  `;

  document.body.prepend(header);

  // Define global logout function if not defined
  if (!window.logout) {
    window.logout = function () {
      localStorage.removeItem('hibiz_user_role');
      localStorage.removeItem('hibiz_token');
      window.location.href = 'login.html';
    };
  }

  // Check system health and update indicator
  if (window.appHelper && typeof window.appHelper.isSystemLive === 'function') {
    const statusIndicator = document.getElementById('systemStatusIndicator');
    try {
      const health = await window.appHelper.isSystemLive();
      if (health.available) {
        statusIndicator.innerHTML = `<i class="fa-solid fa-circle" style="color: #10b981; font-size: 10px;"></i> <span style="color: var(--text-secondary);">Online</span>`;
      } else {
        statusIndicator.innerHTML = `<i class="fa-solid fa-circle" style="color: #ef4444; font-size: 10px;"></i> <span style="color: #ef4444;">Offline</span>`;
        if (health.error) {
          statusIndicator.title = health.error;
        }
      }
    } catch (e) {
      statusIndicator.innerHTML = `<i class="fa-solid fa-circle" style="color: #ef4444; font-size: 10px;"></i> <span style="color: #ef4444;">Offline</span>`;
    }
  }
};

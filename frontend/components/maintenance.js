export function renderMaintenancePage(options = {}) {
  const { showBackButton = true } = options;
  
  return `
    <div class="maintenance-page">
      <div class="maintenance-container">
        <div class="maintenance-icon">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="38" stroke="#D97706" stroke-width="4" fill="none"/>
            <path d="M40 24V40M40 48V56" stroke="#D97706" stroke-width="4" stroke-linecap="round"/>
            <circle cx="40" cy="40" r="3" fill="#D97706"/>
          </svg>
        </div>
        <h1 class="maintenance-title">System Maintenance</h1>
        <p class="maintenance-subtitle">We're performing scheduled maintenance to serve you better.</p>
        <div class="maintenance-details">
          <div class="detail-item">
            <span class="detail-label">Status:</span>
            <span class="detail-value">System is temporarily unavailable</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Expected Duration:</span>
            <span class="detail-value">Please check back shortly</span>
          </div>
        </div>
        <div class="maintenance-message">
          <p>We sincerely apologize for any inconvenience. Our team is working diligently to complete the necessary updates and optimizations.</p>
          <p>Thank you for your patience and understanding.</p>
        </div>
        <div class="maintenance-actions">
          <button class="maintenance-button" onclick="handleBackToLogin()">
            Back to Login
          </button>
        </div>
        <div class="maintenance-contact">
          <p>If you have any urgent concerns, please contact the registrar's office.</p>
        </div>
      </div>
    </div>
  `;
}

// Handle back to login button click
window.handleBackToLogin = function() {
  try {
    // Clear all session data
    sessionStorage.clear();
    localStorage.removeItem('session');
    
    // Navigate to login after brief delay to ensure cleanup
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 100);
  } catch (error) {
    console.error('Error during logout:', error);
    // Force redirect even if there's an error
    window.location.href = '/login.html';
  }
};

// =============== CONFIGURATION ===============
const firebaseConfig = {
  apiKey: "AIzaSyCRtn3buWEHvk9VDVz_eoDmyaTqr8wI3Lg",
  authDomain: "epi-tracker-2025.firebaseapp.com",
  databaseURL: "https://epi-tracker-2025-default-rtdb.firebaseio.com",
  projectId: "epi-tracker-2025",
  storageBucket: "epi-tracker-2025.firebasestorage.app",
  messagingSenderId: "991776109162",
  appId: "1:991776109162:web:f24b9f2bffe08527dc9013",
  measurementId: "G-P5R44DJ1RV"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();

// =============== GLOBAL STATE ===============
let currentUser = null;
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const usersPerPage = 10;
let inactivityTimer;

// =============== DOM ELEMENTS ===============
const elements = {
  loading: document.getElementById('loading'),
  userInfo: document.getElementById('userInfo'),
  logoutBtn: document.getElementById('logoutBtn'),
  dashboard: {
    totalUsers: document.getElementById('totalUsers'),
    totalAdmins: document.getElementById('totalAdmins'),
    totalFacilities: document.getElementById('totalFacilities'),
    activeToday: document.getElementById('activeToday')
  },
  createForm: document.getElementById('createForm'),
  showCreateFormBtn: document.getElementById('showCreateForm'),
  cancelCreateBtn: document.getElementById('cancelCreate'),
  createUserBtn: document.getElementById('createUserBtn'),
  createMessage: document.getElementById('createMessage'),
  searchInput: document.getElementById('searchInput'),
  roleFilter: document.getElementById('roleFilter'),
  facilityFilter: document.getElementById('facilityFilter'),
  applyFilters: document.getElementById('applyFilters'),
  clearFilters: document.getElementById('clearFilters'),
  usersList: document.getElementById('usersList'),
  usersCount: document.getElementById('usersCount'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
  pageInfo: document.getElementById('pageInfo'),
  refreshBtn: document.getElementById('refreshBtn'),
  exportUsersBtn: document.getElementById('exportUsers'),
  toast: document.getElementById('toast'),
  editModal: document.getElementById('editModal'),
  saveEditBtn: document.getElementById('saveEditBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  bulkActions: document.getElementById('bulkActions'),
  bulkActionSelect: document.getElementById('bulkActionSelect'),
  executeBulkAction: document.getElementById('executeBulkAction')
};

// =============== INITIALIZATION ===============
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    setupEventListeners();
    setupInactivityTimer();
    await checkAuth();
    await loadUsers();
    setupServiceWorker();
  } catch (error) {
    showToast('Initialization failed: ' + error.message, 'error');
  }
}

// =============== AUTHENTICATION ===============
async function checkAuth() {
  showLoading(true);
  
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const token = await user.getIdTokenResult();
      
      if (!token.claims.superadmin) {
        showToast('Access denied. Superadmin privileges required.', 'error');
        setTimeout(() => window.location.href = '/', 2000);
        return;
      }
      
      currentUser = user;
      elements.userInfo.innerHTML = `
        <span>👤 ${user.email}</span>
        <span class="badge superadmin" style="margin-left: 10px;">Superadmin</span>
      `;
      showToast('Authenticated as superadmin', 'success');
      showLoading(false);
    } else {
      window.location.href = '/login.html';
    }
  });
}

// =============== LOADING STATE ===============
function showLoading(show) {
  if (show) {
    elements.loading.classList.add('active');
    document.body.style.opacity = '0.7';
    document.body.style.pointerEvents = 'none';
  } else {
    elements.loading.classList.remove('active');
    document.body.style.opacity = '1';
    document.body.style.pointerEvents = 'all';
  }
}

// =============== EVENT LISTENERS ===============
function setupEventListeners() {
  // Authentication
  elements.logoutBtn.addEventListener('click', () => {
    auth.signOut().then(() => window.location.href = '/login.html');
  });
  
  // Create User
  elements.showCreateFormBtn.addEventListener('click', () => {
    elements.createForm.style.display = 'block';
    elements.showCreateFormBtn.style.display = 'none';
  });
  
  elements.cancelCreateBtn.addEventListener('click', () => {
    elements.createForm.style.display = 'none';
    elements.showCreateFormBtn.style.display = 'inline-flex';
    resetCreateForm();
  });
  
  elements.createUserBtn.addEventListener('click', createUser);
  
  // Filtering
  elements.applyFilters.addEventListener('click', applyFilters);
  elements.clearFilters.addEventListener('click', clearFilters);
  elements.searchInput.addEventListener('input', debounce(applyFilters, 300));
  
  // Pagination
  elements.prevPage.addEventListener('click', () => changePage(-1));
  elements.nextPage.addEventListener('click', () => changePage(1));
  
  // Refresh
  elements.refreshBtn.addEventListener('click', loadUsers);
  elements.exportUsersBtn.addEventListener('click', exportUsers);
  
  // Modal
  elements.cancelEditBtn.addEventListener('click', () => {
    elements.editModal.classList.remove('active');
  });
  
  elements.saveEditBtn.addEventListener('click', saveUserEdit);
  
  // Bulk Actions
  elements.bulkActionSelect.addEventListener('change', (e) => {
    elements.bulkActions.style.display = e.target.value ? 'block' : 'none';
  });
  
  elements.executeBulkAction.addEventListener('click', executeBulkAction);
}

// =============== USER MANAGEMENT ===============
async function loadUsers() {
  showLoading(true);
  try {
    const snapshot = await db.collection('users').get();
    allUsers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    applyFilters();
    updateDashboard();
    showToast(`Loaded ${allUsers.length} users`, 'success');
  } catch (error) {
    showToast('Failed to load users: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function applyFilters() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const roleFilter = elements.roleFilter.value;
  const facilityFilter = elements.facilityFilter.value;
  
  filteredUsers = allUsers.filter(user => {
    const matchesSearch = !searchTerm || 
      (user.name && user.name.toLowerCase().includes(searchTerm)) ||
      (user.email && user.email.toLowerCase().includes(searchTerm));
    
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesFacility = !facilityFilter || user.assignedFacility === facilityFilter;
    
    return matchesSearch && matchesRole && matchesFacility;
  });
  
  updateFacilityFilter();
  displayUsers();
}

function clearFilters() {
  elements.searchInput.value = '';
  elements.roleFilter.value = '';
  elements.facilityFilter.value = '';
  applyFilters();
}

function updateFacilityFilter() {
  const facilities = [...new Set(allUsers
    .map(u => u.assignedFacility)
    .filter(f => f && f.trim() !== ''))];
  
  elements.facilityFilter.innerHTML = '<option value="">All Facilities</option>' +
    facilities.map(f => `<option value="${f}">${f}</option>`).join('');
}

function displayUsers() {
  elements.usersCount.textContent = filteredUsers.length;
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = Math.min(startIndex + usersPerPage, filteredUsers.length);
  const pageUsers = filteredUsers.slice(startIndex, endIndex);
  
  // Update pagination controls
  elements.prevPage.disabled = currentPage === 1;
  elements.nextPage.disabled = currentPage === totalPages;
  elements.pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  
  // Render table
  elements.usersList.innerHTML = pageUsers.map(user => `
    <tr>
      <td>${user.name || '-'}</td>
      <td>${user.email || '-'}</td>
      <td><span class="badge ${user.role || 'user'}">${user.role || 'user'}</span></td>
      <td>${user.assignedFacility || '-'}</td>
      <td>${user.phoneNumber || '-'}</td>
      <td class="action-buttons">
        <button onclick="openEditModal('${user.id}')" class="secondary small">✏️ Edit</button>
        ${user.role !== 'superadmin' ? 
          `<button onclick="deleteUser('${user.id}')" class="danger small">🗑️ Delete</button>` : 
          `<button class="secondary small" disabled>Protected</button>`
        }
      </td>
    </tr>
  `).join('');
}

function changePage(direction) {
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  currentPage += direction;
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  displayUsers();
}

async function createUser() {
  const email = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  const name = document.getElementById('newName').value.trim();
  const phone = document.getElementById('newPhone').value.trim();
  const facility = document.getElementById('newFacility').value.trim();
  const role = document.getElementById('newRole').value;
  
  // Validation
  if (!validateEmail(email)) {
    showMessage('Invalid email format', 'error', elements.createMessage);
    return;
  }
  
  if (!validatePassword(password)) {
    showMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character', 'error', elements.createMessage);
    return;
  }
  
  showLoading(true);
  
  try {
    // Create user in Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCredential.user.uid;
    
    // Set user data in Firestore
    await db.collection('users').doc(uid).set({
      email,
      name,
      phoneNumber: phone,
      assignedFacility: facility,
      role: role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email
    });
    
    // Set custom claims for admin users
    if (role === 'admin') {
      const makeAdmin = functions.httpsCallable('makeAdmin');
      await makeAdmin({ email });
    }
    
    // Log the action
    await logAction('user_created', { email, name, role });
    
    showMessage('✅ User created successfully!', 'success', elements.createMessage);
    resetCreateForm();
    await loadUsers();
    
  } catch (error) {
    showMessage('❌ ' + error.message, 'error', elements.createMessage);
  } finally {
    showLoading(false);
  }
}

function resetCreateForm() {
  document.getElementById('newEmail').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newName').value = '';
  document.getElementById('newPhone').value = '';
  document.getElementById('newFacility').value = '';
  document.getElementById('newRole').value = 'user';
  elements.createMessage.innerHTML = '';
}

// =============== EDIT USER ===============
let editingUserId = null;

function openEditModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  editingUserId = userId;
  document.getElementById('editName').value = user.name || '';
  document.getElementById('editPhone').value = user.phoneNumber || '';
  document.getElementById('editFacility').value = user.assignedFacility || '';
  document.getElementById('editRole').value = user.role || 'user';
  
  elements.editModal.classList.add('active');
}

async function saveUserEdit() {
  const name = document.getElementById('editName').value.trim();
  const phone = document.getElementById('editPhone').value.trim();
  const facility = document.getElementById('editFacility').value.trim();
  const role = document.getElementById('editRole').value;
  
  const updates = {};
  if (name) updates.name = name;
  if (phone) updates.phoneNumber = phone;
  if (facility) updates.assignedFacility = facility;
  updates.role = role;
  updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  updates.updatedBy = currentUser.email;
  
  showLoading(true);
  
  try {
    // Update Firestore
    await db.collection('users').doc(editingUserId).update(updates);
    
    // Update custom claims if role changed
    const user = allUsers.find(u => u.id === editingUserId);
    if (role !== user.role) {
      if (role === 'admin') {
        const makeAdmin = functions.httpsCallable('makeAdmin');
        await makeAdmin({ uid: editingUserId });
      } else if (role === 'user') {
        const removeAdmin = functions.httpsCallable('removeAdmin');
        await removeAdmin({ uid: editingUserId });
      }
    }
    
    // Log action
    await logAction('user_updated', { userId: editingUserId, updates });
    
    showToast('✅ User updated successfully!', 'success');
    elements.editModal.classList.remove('active');
    await loadUsers();
    
  } catch (error) {
    showToast('❌ Failed to update user: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// =============== DELETE USER ===============
async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
    return;
  }
  
  showLoading(true);
  
  try {
    const deleteUserFn = functions.httpsCallable('deleteUser');
    await deleteUserFn({ uid: userId });
    
    // Log action
    await logAction('user_deleted', { userId });
    
    showToast('✅ User deleted successfully!', 'success');
    await loadUsers();
    
  } catch (error) {
    showToast('❌ Failed to delete user: ' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// =============== DASHBOARD ===============
async function updateDashboard() {
  // Basic counts
  const totalUsers = allUsers.length;
  const admins = allUsers.filter(u => u.role === 'admin').length;
  
  // Unique facilities
  const facilities = new Set();
  allUsers.forEach(user => {
    if (user.assignedFacility && user.assignedFacility.trim()) {
      facilities.add(user.assignedFacility);
    }
  });
  
  // Active today (users created or active today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeToday = allUsers.filter(user => {
    if (user.createdAt) {
      const created = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
      return created >= today;
    }
    return false;
  }).length;
  
  elements.dashboard.totalUsers.textContent = totalUsers;
  elements.dashboard.totalAdmins.textContent = admins;
  elements.dashboard.totalFacilities.textContent = facilities.size;
  elements.dashboard.activeToday.textContent = activeToday;
}

// =============== BULK ACTIONS ===============
async function executeBulkAction() {
  const action = elements.bulkActionSelect.value;
  
  switch(action) {
    case 'assign_facility':
      const facility = prompt('Enter facility name:');
      if (facility) {
        // Implementation for assigning facility to selected users
        showToast('Assigning facility to selected users...', 'info');
      }
      break;
      
    case 'assign_role':
      const role = prompt('Enter role (user/admin):');
      if (role === 'user' || role === 'admin') {
        // Implementation for assigning role to selected users
        showToast('Assigning role to selected users...', 'info');
      }
      break;
      
    case 'export_selected':
      exportUsers(true);
      break;
      
    case 'delete_selected':
      if (confirm('Are you sure you want to delete all selected users?')) {
        showToast('Deleting selected users...', 'info');
      }
      break;
  }
  
  elements.bulkActionSelect.value = '';
  elements.bulkActions.style.display = 'none';
}

// =============== EXPORT ===============
function exportUsers(selectedOnly = false) {
  const usersToExport = selectedOnly ? 
    filteredUsers.filter(u => u.selected) : 
    filteredUsers;
  
  if (usersToExport.length === 0) {
    showToast('No users to export', 'error');
    return;
  }
  
  const csv = [
    ['Name', 'Email', 'Role', 'Facility', 'Phone', 'Created'],
    ...usersToExport.map(user => [
      user.name || '',
      user.email || '',
      user.role || '',
      user.assignedFacility || '',
      user.phoneNumber || '',
      user.createdAt ? user.createdAt.toDate().toLocaleDateString() : ''
    ])
  ].map(row => row.join(',')).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `epi-users-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  showToast(`Exported ${usersToExport.length} users to CSV`, 'success');
}

// =============== UTILITIES ===============
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*]/.test(password);
  
  return password.length >= minLength && hasUpperCase && 
         hasLowerCase && hasNumbers && hasSpecialChar;
}

function showToast(message, type = 'info', duration = 3000) {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, duration);
}

function showMessage(message, type, element) {
  element.textContent = message;
  element.className = `message ${type}`;
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function setupInactivityTimer() {
  const resetTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (confirm('You have been inactive for 30 minutes. Do you want to stay logged in?')) {
        resetTimer();
      } else {
        auth.signOut();
      }
    }, 30 * 60 * 1000);
  };
  
  ['click', 'mousemove', 'keypress', 'scroll'].forEach(event => {
    document.addEventListener(event, resetTimer);
  });
  
  resetTimer();
}

async function logAction(action, details) {
  try {
    await db.collection('audit_logs').add({
      action,
      details,
      performedBy: currentUser.email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw-admin.js')
      .then(() => console.log('Admin Service Worker registered'))
      .catch(err => console.error('SW registration failed:', err));
  }
}

// =============== GLOBAL EXPORTS ===============
// Make functions available globally for onclick handlers
window.deleteUser = deleteUser;
window.openEditModal = openEditModal;
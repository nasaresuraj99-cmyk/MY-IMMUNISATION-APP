// Global State
let currentUser = null;
let currentFacility = null;
let isSuperAdmin = false;
let childrenData = [];
let facilitiesData = [];
let auditLogsData = [];

// DOM Elements
const views = {
    login: document.getElementById('loginView'),
    register: document.getElementById('registerView'),
    dashboard: document.getElementById('dashboardView'),
    children: document.getElementById('childrenView'),
    childForm: document.getElementById('childFormView'),
    facility: document.getElementById('facilityView'),
    facilityForm: document.getElementById('facilityFormView'),
    reports: document.getElementById('reportsView'),
    audit: document.getElementById('auditView')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupEventListeners();
});

// Firebase Auth State Observer
function initAuth() {
    firebaseServices.auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            await loadUserData();
            showView('dashboard');
            updateNavForAuth();
        } else {
            currentUser = null;
            currentFacility = null;
            isSuperAdmin = false;
            showView('login');
            updateNavForAuth();
        }
    });
}

// Load User Data
async function loadUserData() {
    showLoading(true);
    
    try {
        // Check if user is super admin
        isSuperAdmin = currentUser.email === 'superadmin@fit.gov.gh';
        
        if (isSuperAdmin) {
            await loadAllFacilities();
            await loadAllChildren();
            await loadAllAuditLogs();
        } else {
            // Load facility for regular user
            const facilitySnapshot = await firebaseServices.db
                .collection(firebaseServices.collections.FACILITIES_COLLECTION)
                .where('userId', '==', currentUser.uid)
                .limit(1)
                .get();
            
            if (!facilitySnapshot.empty) {
                currentFacility = {
                    id: facilitySnapshot.docs[0].id,
                    ...facilitySnapshot.docs[0].data()
                };
                await loadFacilityChildren();
                await loadFacilityAuditLogs();
            }
        }
        
        updateDashboard();
    } catch (error) {
        showToast('Error loading data: ' + error.message, 'error');
    }
    
    showLoading(false);
}

// Navigation
function toggleMenu() {
    const menu = document.getElementById('navMenu');
    menu.classList.toggle('active');
}

function updateNavForAuth() {
    const navMenu = document.getElementById('navMenu');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (currentUser) {
        navMenu.style.display = 'flex';
        logoutBtn.style.display = 'block';
    } else {
        navMenu.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

function showView(viewName) {
    // Hide all views
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.remove('active');
        }
    });
    
    // Show selected view
    if (views[viewName]) {
        views[viewName].classList.add('active');
        
        // Load data for the view
        switch(viewName) {
            case 'dashboard':
                updateDashboard();
                break;
            case 'children':
                displayChildrenList();
                break;
            case 'facility':
                displayFacilityInfo();
                break;
            case 'reports':
                generateReports();
                break;
            case 'audit':
                loadAuditLogs();
                break;
        }
    }
    
    // Close mobile menu
    const menu = document.getElementById('navMenu');
    menu.classList.remove('active');
}

// Authentication
async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showToast('Please enter email and password', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        await firebaseServices.auth.signInWithEmailAndPassword(email, password);
        showToast('Login successful', 'success');
    } catch (error) {
        showToast('Login failed: ' + error.message, 'error');
    }
    
    showLoading(false);
}

function logout() {
    firebaseServices.auth.signOut();
    showToast('Logged out successfully', 'success');
}

function showRegister() {
    showView('register');
}

function showLogin() {
    showView('login');
}

function useSuperAdminCredentials() {
    document.getElementById('email').value = 'superadmin@fit.gov.gh';
    document.getElementById('password').value = 'SuperAdmin123!';
    showToast('Super admin credentials loaded. Click Login to continue.', 'info');
}

// Facility Registration
async function registerFacility() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const name = document.getElementById('facilityName').value;
    const region = document.getElementById('facilityRegion').value;
    const district = document.getElementById('facilityDistrict').value;
    const contact = document.getElementById('facilityContact').value;
    
    // Validation
    if (!email || !password || !name || !region || !district) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'warning');
        return;
    }
    
    showLoading(true);
    
    try {
        // Create user
        const userCredential = await firebaseServices.auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Create facility document
        const facilityData = {
            name,
            region,
            district,
            contact,
            userId: user.uid,
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const facilityRef = await firebaseServices.db
            .collection(firebaseServices.collections.FACILITIES_COLLECTION)
            .add(facilityData);
        
        // Log the action
        await logAudit('create', 'facility', facilityRef.id, null, facilityData);
        
        showToast('Facility registered successfully!', 'success');
        showView('login');
    } catch (error) {
        showToast('Registration failed: ' + error.message, 'error');
    }
    
    showLoading(false);
}

// Children Management
function showAddChild() {
    document.getElementById('childFormTitle').textContent = 'Add New Child';
    document.getElementById('childFormView').dataset.childId = '';
    
    // Clear form
    document.getElementById('childName').value = '';
    document.getElementById('childDOB').value = '';
    document.getElementById('childSex').value = '';
    document.getElementById('childGuardian').value = '';
    document.getElementById('childContact').value = '';
    document.getElementById('childAddress').value = '';
    
    // Generate vaccine checklist
    generateVaccineChecklist();
    
    showView('childForm');
}

function showEditChild(childId) {
    const child = childrenData.find(c => c.id === childId);
    if (!child) return;
    
    document.getElementById('childFormTitle').textContent = 'Edit Child';
    document.getElementById('childFormView').dataset.childId = childId;
    
    // Fill form
    document.getElementById('childName').value = child.name;
    document.getElementById('childDOB').value = child.dob;
    document.getElementById('childSex').value = child.sex;
    document.getElementById('childGuardian').value = child.guardian || '';
    document.getElementById('childContact').value = child.contact || '';
    document.getElementById('childAddress').value = child.address || '';
    
    // Generate vaccine checklist with current status
    generateVaccineChecklist(child.vaccines || []);
    
    showView('childForm');
}

async function saveChild() {
    const childId = document.getElementById('childFormView').dataset.childId;
    const isEdit = !!childId;
    
    const childData = {
        name: document.getElementById('childName').value,
        dob: document.getElementById('childDOB').value,
        sex: document.getElementById('childSex').value,
        guardian: document.getElementById('childGuardian').value,
        contact: document.getElementById('childContact').value,
        address: document.getElementById('childAddress').value,
        facilityId: currentFacility.id,
        facilityName: currentFacility.name,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Validation
    if (!childData.name || !childData.dob || !childData.sex) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    // Calculate age
    const ageWeeks = vaccineUtils.calculateAgeInWeeks(childData.dob);
    if (ageWeeks > 240) { // 60 months = 240 weeks
        showToast('Child must be 0-59 months old', 'warning');
        return;
    }
    
    // Get vaccine status from checklist
    const vaccineCheckboxes = document.querySelectorAll('.vaccine-checkbox:checked');
    childData.vaccines = Array.from(vaccineCheckboxes).map(cb => ({
        vaccineId: cb.dataset.vaccineId,
        administered: true,
        administeredDate: new Date().toISOString().split('T')[0]
    }));
    
    showLoading(true);
    
    try {
        let oldData = null;
        
        if (isEdit) {
            // Update existing child
            const childRef = firebaseServices.db
                .collection(firebaseServices.collections.CHILDREN_COLLECTION)
                .doc(childId);
            
            // Get old data for audit log
            const oldSnapshot = await childRef.get();
            oldData = oldSnapshot.data();
            
            await childRef.update(childData);
            showToast('Child updated successfully', 'success');
        } else {
            // Create new child
            childData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            childData.createdBy = currentUser.uid;
            
            const childRef = await firebaseServices.db
                .collection(firebaseServices.collections.CHILDREN_COLLECTION)
                .add(childData);
            
            childId = childRef.id;
            showToast('Child added successfully', 'success');
        }
        
        // Log the action
        await logAudit(
            isEdit ? 'update' : 'create',
            'child',
            childId,
            oldData,
            childData
        );
        
        // Reload data
        if (isSuperAdmin) {
            await loadAllChildren();
        } else {
            await loadFacilityChildren();
        }
        
        showView('children');
    } catch (error) {
        showToast('Error saving child: ' + error.message, 'error');
    }
    
    showLoading(false);
}

async function deleteChild(childId) {
    if (!confirm('Are you sure you want to delete this child record?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const childRef = firebaseServices.db
            .collection(firebaseServices.collections.CHILDREN_COLLECTION)
            .doc(childId);
        
        // Get data for audit log
        const snapshot = await childRef.get();
        const oldData = snapshot.data();
        
        await childRef.delete();
        
        // Log the action
        await logAudit('delete', 'child', childId, oldData, null);
        
        // Reload data
        if (isSuperAdmin) {
            await loadAllChildren();
        } else {
            await loadFacilityChildren();
        }
        
        showToast('Child deleted successfully', 'success');
    } catch (error) {
        showToast('Error deleting child: ' + error.message, 'error');
    }
    
    showLoading(false);
}

function generateVaccineChecklist(administeredVaccines = []) {
    const container = document.getElementById('vaccineChecklist');
    container.innerHTML = '';
    
    const ageWeeks = document.getElementById('childDOB').value ? 
        vaccineUtils.calculateAgeInWeeks(document.getElementById('childDOB').value) : 0;
    
    vaccineSchedule.forEach(vaccine => {
        const isAdministered = administeredVaccines.some(v => 
            v.vaccineId === vaccine.id && v.administered
        );
        const isDue = ageWeeks >= vaccine.dueAge;
        
        const div = document.createElement('div');
        div.className = 'vaccine-item';
        
        if (!isDue) {
            div.style.opacity = '0.6';
        }
        
        div.innerHTML = `
            <div>
                <strong>${vaccine.name}</strong>
                <div class="vaccine-date">Due: ${vaccine.dose}</div>
            </div>
            <div>
                <input type="checkbox" 
                       class="vaccine-checkbox" 
                       data-vaccine-id="${vaccine.id}"
                       ${isAdministered ? 'checked' : ''}
                       ${!isDue ? 'disabled' : ''}>
                <label>Administered</label>
            </div>
        `;
        
        container.appendChild(div);
    });
}

// Facility Management
function displayFacilityInfo() {
    const container = document.getElementById('facilityInfo');
    
    if (isSuperAdmin) {
        document.getElementById('allFacilitiesSection').style.display = 'block';
        displayAllFacilities();
        container.innerHTML = '<p>Super Admin: Viewing all facilities</p>';
    } else if (currentFacility) {
        container.innerHTML = `
            <div class="facility-details">
                <h3>${currentFacility.name}</h3>
                <p><strong>Region:</strong> ${currentFacility.region}</p>
                <p><strong>District:</strong> ${currentFacility.district}</p>
                <p><strong>Contact:</strong> ${currentFacility.contact || 'N/A'}</p>
                <p><strong>Email:</strong> ${currentFacility.email}</p>
                <p><strong>Registered:</strong> ${new Date(currentFacility.createdAt?.toDate()).toLocaleDateString()}</p>
            </div>
        `;
    }
}

function showEditFacility() {
    if (!currentFacility && !isSuperAdmin) return;
    
    document.getElementById('facilityFormTitle').textContent = 
        isSuperAdmin ? 'Edit Facility (Super Admin)' : 'Edit Facility';
    
    if (currentFacility) {
        document.getElementById('editFacilityName').value = currentFacility.name;
        document.getElementById('editFacilityRegion').value = currentFacility.region;
        document.getElementById('editFacilityDistrict').value = currentFacility.district;
        document.getElementById('editFacilityContact').value = currentFacility.contact || '';
    }
    
    // Show delete button for super admin
    document.getElementById('deleteFacilityBtn').style.display = 
        isSuperAdmin ? 'block' : 'none';
    
    showView('facilityForm');
}

async function updateFacility() {
    const facilityId = isSuperAdmin ? 
        document.getElementById('facilityFormView').dataset.facilityId : 
        currentFacility.id;
    
    const updates = {
        name: document.getElementById('editFacilityName').value,
        region: document.getElementById('editFacilityRegion').value,
        district: document.getElementById('editFacilityDistrict').value,
        contact: document.getElementById('editFacilityContact').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    showLoading(true);
    
    try {
        const facilityRef = firebaseServices.db
            .collection(firebaseServices.collections.FACILITIES_COLLECTION)
            .doc(facilityId);
        
        // Get old data for audit log
        const snapshot = await facilityRef.get();
        const oldData = snapshot.data();
        
        await facilityRef.update(updates);
        
        // Log the action
        await logAudit('update', 'facility', facilityId, oldData, updates);
        
        // Update local data
        if (!isSuperAdmin) {
            currentFacility = { ...currentFacility, ...updates };
        }
        
        showToast('Facility updated successfully', 'success');
        showView('facility');
    } catch (error) {
        showToast('Error updating facility: ' + error.message, 'error');
    }
    
    showLoading(false);
}

async function deleteFacility() {
    const facilityId = document.getElementById('facilityFormView').dataset.facilityId;
    
    if (!confirm('Are you sure you want to delete this facility? This will also delete all associated children records.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        // Delete facility
        const facilityRef = firebaseServices.db
            .collection(firebaseServices.collections.FACILITIES_COLLECTION)
            .doc(facilityId);
        
        // Get data for audit log
        const snapshot = await facilityRef.get();
        const oldData = snapshot.data();
        
        await facilityRef.delete();
        
        // Delete all children in this facility
        const childrenSnapshot = await firebaseServices.db
            .collection(firebaseServices.collections.CHILDREN_COLLECTION)
            .where('facilityId', '==', facilityId)
            .get();
        
        const batch = firebaseServices.db.batch();
        childrenSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        // Log the action
        await logAudit('delete', 'facility', facilityId, oldData, null);
        
        // Reload data
        await loadAllFacilities();
        
        showToast('Facility deleted successfully', 'success');
        showView('facility');
    } catch (error) {
        showToast('Error deleting facility: ' + error.message, 'error');
    }
    
    showLoading(false);
}

// Dashboard
function updateDashboard() {
    if (!currentUser) return;
    
    // Update user info
    document.getElementById('userInfo').textContent = 
        isSuperAdmin ? 'Super Admin' : (currentFacility?.name || 'Facility User');
    
    if (isSuperAdmin) {
        updateSuperAdminDashboard();
    } else {
        updateFacilityDashboard();
    }
}

function updateFacilityDashboard() {
    // Calculate statistics
    const totalChildren = childrenData.length;
    const dueVaccinations = childrenData.filter(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        return dueVaccines.some(v => v.status === 'due');
    }).length;
    
    const defaulters = childrenData.filter(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        return dueVaccines.some(v => v.status === 'overdue');
    }).length;
    
    const coverageRate = totalChildren > 0 ? 
        Math.round((childrenData.filter(child => {
            const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
            return dueVaccines.length === 0;
        }).length / totalChildren) * 100) : 0;
    
    // Update stats
    document.getElementById('totalChildren').textContent = totalChildren;
    document.getElementById('dueVaccinations').textContent = dueVaccinations;
    document.getElementById('defaulters').textContent = defaulters;
    document.getElementById('coverageRate').textContent = `${coverageRate}%`;
    
    // Show recent children
    const recentChildren = childrenData
        .sort((a, b) => new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate()))
        .slice(0, 5);
    
    displayRecentChildren(recentChildren);
    
    // Show upcoming vaccinations
    displayUpcomingVaccinations();
    
    // Show defaulter list
    displayDefaulterList();
}

function updateSuperAdminDashboard() {
    // System-wide statistics
    document.getElementById('totalFacilities').textContent = facilitiesData.length;
    document.getElementById('totalChildren').textContent = childrenData.length;
    
    // Calculate system coverage
    const totalChildrenWithVaccines = childrenData.filter(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        return dueVaccines.length === 0;
    }).length;
    
    const systemCoverage = childrenData.length > 0 ? 
        Math.round((totalChildrenWithVaccines / childrenData.length) * 100) : 0;
    
    document.getElementById('systemCoverage').textContent = `${systemCoverage}%`;
    
    // Calculate system defaulters
    const systemDefaulters = childrenData.filter(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        return dueVaccines.some(v => v.status === 'overdue');
    }).length;
    
    document.getElementById('systemDefaulters').textContent = systemDefaulters;
    
    // Show facilities list
    displayFacilitiesList();
    
    // Show recent children from all facilities
    const recentChildren = childrenData
        .sort((a, b) => new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate()))
        .slice(0, 10);
    
    displayRecentChildren(recentChildren);
}

// Data Loading Functions
async function loadAllFacilities() {
    const snapshot = await firebaseServices.db
        .collection(firebaseServices.collections.FACILITIES_COLLECTION)
        .get();
    
    facilitiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function loadAllChildren() {
    const snapshot = await firebaseServices.db
        .collection(firebaseServices.collections.CHILDREN_COLLECTION)
        .get();
    
    childrenData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function loadFacilityChildren() {
    const snapshot = await firebaseServices.db
        .collection(firebaseServices.collections.CHILDREN_COLLECTION)
        .where('facilityId', '==', currentFacility.id)
        .get();
    
    childrenData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function loadAllAuditLogs() {
    const snapshot = await firebaseServices.db
        .collection(firebaseServices.collections.AUDIT_LOGS_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();
    
    auditLogsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function loadFacilityAuditLogs() {
    const snapshot = await firebaseServices.db
        .collection(firebaseServices.collections.AUDIT_LOGS_COLLECTION)
        .where('facilityId', '==', currentFacility.id)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
    
    auditLogsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// Display Functions
function displayChildrenList() {
    const container = document.getElementById('childrenList');
    const searchTerm = document.getElementById('searchChild').value.toLowerCase();
    const filterStatus = document.getElementById('filterStatus').value;
    
    let filteredChildren = childrenData;
    
    // Apply search filter
    if (searchTerm) {
        filteredChildren = filteredChildren.filter(child => 
            child.name.toLowerCase().includes(searchTerm) ||
            (child.guardian && child.guardian.toLowerCase().includes(searchTerm))
        );
    }
    
    // Apply status filter
    if (filterStatus) {
        filteredChildren = filteredChildren.filter(child => {
            const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
            
            if (filterStatus === 'up-to-date') {
                return dueVaccines.length === 0;
            } else if (filterStatus === 'due') {
                return dueVaccines.some(v => v.status === 'due');
            } else if (filterStatus === 'overdue') {
                return dueVaccines.some(v => v.status === 'overdue');
            }
            return true;
        });
    }
    
    if (filteredChildren.length === 0) {
        container.innerHTML = '<p class="no-data">No children found</p>';
        return;
    }
    
    let html = `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Sex</th>
                    <th>Guardian</th>
                    <th>Vaccination Status</th>
                    <th>Next Due</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    filteredChildren.forEach(child => {
        const ageWeeks = vaccineUtils.calculateAgeInWeeks(child.dob);
        const ageMonths = Math.floor(ageWeeks / 4);
        const nextVaccine = vaccineUtils.getNextVaccine(child.dob, child.vaccines || []);
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        
        let status = 'up-to-date';
        let statusText = 'Up to Date';
        
        if (dueVaccines.some(v => v.status === 'overdue')) {
            status = 'overdue';
            statusText = 'Overdue';
        } else if (dueVaccines.some(v => v.status === 'due')) {
            status = 'due';
            statusText = 'Due Soon';
        }
        
        html += `
            <tr>
                <td>${child.name}</td>
                <td>${ageMonths} months</td>
                <td>${child.sex}</td>
                <td>${child.guardian || 'N/A'}</td>
                <td><span class="status-badge status-${status}">${statusText}</span></td>
                <td>${nextVaccine ? nextVaccine.name : 'Complete'}</td>
                <td>
                    <button onclick="showEditChild('${child.id}')" class="btn btn-secondary">Edit</button>
                    <button onclick="deleteChild('${child.id}')" class="btn btn-danger">Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function displayRecentChildren(children) {
    const container = document.getElementById('recentChildren');
    
    if (children.length === 0) {
        container.innerHTML = '<p class="no-data">No children registered</p>';
        return;
    }
    
    let html = '';
    children.forEach(child => {
        const ageMonths = Math.floor(vaccineUtils.calculateAgeInWeeks(child.dob) / 4);
        html += `
            <div class="child-item">
                <strong>${child.name}</strong>
                <span>${ageMonths} months • ${child.sex}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function displayUpcomingVaccinations() {
    const container = document.getElementById('upcomingVaccinations');
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    let upcoming = [];
    
    childrenData.forEach(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        dueVaccines.forEach(vaccine => {
            if (vaccine.status === 'due' && vaccine.dueDate <= nextWeek) {
                upcoming.push({
                    childName: child.name,
                    vaccine: vaccine.name,
                    dueDate: vaccine.dueDate,
                    daysLeft: Math.ceil((vaccine.dueDate - today) / (1000 * 60 * 60 * 24))
                });
            }
        });
    });
    
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
    
    if (upcoming.length === 0) {
        container.innerHTML = '<p class="no-data">No upcoming vaccinations</p>';
        return;
    }
    
    let html = '';
    upcoming.slice(0, 5).forEach(item => {
        html += `
            <div class="vaccination-item ${item.daysLeft <= 0 ? 'overdue' : 'due'}">
                <strong>${item.childName}</strong>
                <span>${item.vaccine} - Due in ${item.daysLeft} days</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function displayDefaulterList() {
    const container = document.getElementById('defaulterList');
    
    let defaulters = [];
    
    childrenData.forEach(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        const overdueVaccines = dueVaccines.filter(v => v.status === 'overdue');
        
        if (overdueVaccines.length > 0) {
            defaulters.push({
                childId: child.id,
                childName: child.name,
                guardian: child.guardian,
                contact: child.contact,
                overdueVaccines: overdueVaccines,
                daysOverdue: Math.ceil((new Date() - overdueVaccines[0].dueDate) / (1000 * 60 * 60 * 24))
            });
        }
    });
    
    defaulters.sort((a, b) => b.daysOverdue - a.daysOverdue);
    
    if (defaulters.length === 0) {
        container.innerHTML = '<p class="no-data">No defaulters found</p>';
        return;
    }
    
    let html = '<table><thead><tr><th>Child</th><th>Guardian</th><th>Contact</th><th>Overdue Vaccines</th><th>Days Overdue</th><th>Actions</th></tr></thead><tbody>';
    
    defaulters.forEach(defaulter => {
        html += `
            <tr>
                <td>${defaulter.childName}</td>
                <td>${defaulter.guardian || 'N/A'}</td>
                <td>${defaulter.contact || 'N/A'}</td>
                <td>${defaulter.overdueVaccines.map(v => v.name).join(', ')}</td>
                <td>${defaulter.daysOverdue}</td>
                <td><button onclick="showEditChild('${defaulter.childId}')" class="btn btn-primary">Update</button></td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function displayFacilitiesList() {
    const container = document.getElementById('facilitiesList');
    
    if (facilitiesData.length === 0) {
        container.innerHTML = '<p class="no-data">No facilities registered</p>';
        return;
    }
    
    let html = '<table><thead><tr><th>Facility Name</th><th>Region</th><th>District</th><th>Contact</th><th>Children</th><th>Actions</th></tr></thead><tbody>';
    
    facilitiesData.forEach(facility => {
        const facilityChildren = childrenData.filter(child => child.facilityId === facility.id);
        
        html += `
            <tr>
                <td>${facility.name}</td>
                <td>${facility.region}</td>
                <td>${facility.district}</td>
                <td>${facility.contact || 'N/A'}</td>
                <td>${facilityChildren.length}</td>
                <td>
                    <button onclick="editFacilityAsSuperAdmin('${facility.id}')" class="btn btn-secondary">Edit</button>
                    <button onclick="deleteFacilityAsSuperAdmin('${facility.id}')" class="btn btn-danger">Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function editFacilityAsSuperAdmin(facilityId) {
    const facility = facilitiesData.find(f => f.id === facilityId);
    if (!facility) return;
    
    document.getElementById('facilityFormTitle').textContent = 'Edit Facility (Super Admin)';
    document.getElementById('facilityFormView').dataset.facilityId = facilityId;
    document.getElementById('editFacilityName').value = facility.name;
    document.getElementById('editFacilityRegion').value = facility.region;
    document.getElementById('editFacilityDistrict').value = facility.district;
    document.getElementById('editFacilityContact').value = facility.contact || '';
    document.getElementById('deleteFacilityBtn').style.display = 'block';
    
    showView('facilityForm');
}

function deleteFacilityAsSuperAdmin(facilityId) {
    document.getElementById('facilityFormView').dataset.facilityId = facilityId;
    deleteFacility();
}

// Audit Logs
async function loadAuditLogs() {
    const container = document.getElementById('auditLogs');
    const actionFilter = document.getElementById('auditActionFilter').value;
    const dateFilter = document.getElementById('auditDateFilter').value;
    
    let filteredLogs = auditLogsData;
    
    if (actionFilter) {
        filteredLogs = filteredLogs.filter(log => log.actionType === actionFilter);
    }
    
    if (dateFilter) {
        const filterDate = new Date(dateFilter);
        filteredLogs = filteredLogs.filter(log => {
            const logDate = new Date(log.timestamp?.toDate());
            return logDate.toDateString() === filterDate.toDateString();
        });
    }
    
    if (filteredLogs.length === 0) {
        container.innerHTML = '<p class="no-data">No audit logs found</p>';
        return;
    }
    
    let html = '';
    filteredLogs.forEach(log => {
        const timestamp = log.timestamp?.toDate ? 
            new Date(log.timestamp.toDate()).toLocaleString() : 
            'Unknown time';
        
        html += `
            <div class="audit-log-item ${log.actionType}">
                <div><strong>${log.actionType.toUpperCase()}</strong> - ${log.targetType}</div>
                <div>User: ${log.userId}</div>
                <div>Target: ${log.targetId}</div>
                <div class="log-details">${timestamp}</div>
                ${log.oldData || log.newData ? `
                    <details>
                        <summary>View Details</summary>
                        ${log.oldData ? `<p><strong>Before:</strong> ${JSON.stringify(log.oldData, null, 2)}</p>` : ''}
                        ${log.newData ? `<p><strong>After:</strong> ${JSON.stringify(log.newData, null, 2)}</p>` : ''}
                    </details>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Audit Logging
async function logAudit(actionType, targetType, targetId, oldData, newData) {
    try {
        const auditLog = {
            actionType,
            targetType,
            targetId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            oldData: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
            newData: newData ? JSON.parse(JSON.stringify(newData)) : null
        };
        
        if (currentFacility) {
            auditLog.facilityId = currentFacility.id;
            auditLog.facilityName = currentFacility.name;
        }
        
        await firebaseServices.db
            .collection(firebaseServices.collections.AUDIT_LOGS_COLLECTION)
            .add(auditLog);
            
        // Update local audit logs
        auditLogsData.unshift(auditLog);
    } catch (error) {
        console.error('Error logging audit:', error);
    }
}

// Reports
function generateReports() {
    generateCoverageChart();
    generateDefaulterChart();
    generateVaccineScheduleDisplay();
}

function generateCoverageChart() {
    const container = document.getElementById('coverageChart');
    
    if (childrenData.length === 0) {
        container.innerHTML = '<p class="no-data">No data available</p>';
        return;
    }
    
    // Calculate coverage by age group
    const ageGroups = [
        { label: '0-12m', min: 0, max: 48 },
        { label: '12-24m', min: 48, max: 96 },
        { label: '24-36m', min: 96, max: 144 },
        { label: '36-48m', min: 144, max: 192 },
        { label: '48-60m', min: 192, max: 240 }
    ];
    
    let html = '<div class="coverage-bars">';
    
    ageGroups.forEach(group => {
        const groupChildren = childrenData.filter(child => {
            const ageWeeks = vaccineUtils.calculateAgeInWeeks(child.dob);
            return ageWeeks >= group.min && ageWeeks < group.max;
        });
        
        const upToDate = groupChildren.filter(child => {
            const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
            return dueVaccines.length === 0;
        }).length;
        
        const coverage = groupChildren.length > 0 ? 
            Math.round((upToDate / groupChildren.length) * 100) : 0;
        
        html += `
            <div class="coverage-bar">
                <div class="bar-label">${group.label}</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${coverage}%"></div>
                </div>
                <div class="bar-value">${coverage}%</div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function generateDefaulterChart() {
    const container = document.getElementById('defaulterChart');
    
    if (childrenData.length === 0) {
        container.innerHTML = '<p class="no-data">No data available</p>';
        return;
    }
    
    // Calculate defaulters by vaccine
    const vaccineStats = {};
    
    childrenData.forEach(child => {
        const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
        const overdueVaccines = dueVaccines.filter(v => v.status === 'overdue');
        
        overdueVaccines.forEach(vaccine => {
            if (!vaccineStats[vaccine.name]) {
                vaccineStats[vaccine.name] = 0;
            }
            vaccineStats[vaccine.name]++;
        });
    });
    
    let html = '<div class="defaulter-stats">';
    
    Object.entries(vaccineStats)
        .sort((a, b) => b[1] - a[1])
        .forEach(([vaccine, count]) => {
            const percentage = Math.round((count / childrenData.length) * 100);
            html += `
                <div class="defaulter-item">
                    <div class="defaulter-label">${vaccine}</div>
                    <div class="defaulter-bar" style="width: ${percentage * 2}px"></div>
                    <div class="defaulter-count">${count} (${percentage}%)</div>
                </div>
            `;
        });
    
    html += '</div>';
    container.innerHTML = html;
}

function generateVaccineScheduleDisplay() {
    const container = document.getElementById('vaccineSchedule');
    
    let html = '';
    vaccineSchedule.forEach(vaccine => {
        html += `
            <div class="schedule-item">
                <div>
                    <strong>${vaccine.name}</strong>
                    <div>${vaccine.dose}</div>
                </div>
                <div>Due at ${vaccine.dueAge} weeks</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Export Functions
async function exportToCSV() {
    const data = childrenData.map(child => ({
        Name: child.name,
        'Date of Birth': child.dob,
        Sex: child.sex,
        Age: `${Math.floor(vaccineUtils.calculateAgeInWeeks(child.dob) / 4)} months`,
        Guardian: child.guardian || '',
        Contact: child.contact || '',
        Address: child.address || '',
        Facility: child.facilityName,
        'Vaccination Status': getVaccinationStatus(child),
        'Next Due Vaccine': getNextDueVaccine(child)
    }));
    
    const csv = convertToCSV(data);
    downloadCSV(csv, 'immunization-data.csv');
}

function convertToCSV(data) {
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
        headers.map(header => JSON.stringify(row[header] || '')).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

function generatePDF() {
    showToast('PDF generation would require a PDF library integration', 'info');
}

function getVaccinationStatus(child) {
    const dueVaccines = vaccineUtils.getDueVaccines(child.dob, child.vaccines || []);
    
    if (dueVaccines.length === 0) return 'Up to Date';
    if (dueVaccines.some(v => v.status === 'overdue')) return 'Overdue';
    if (dueVaccines.some(v => v.status === 'due')) return 'Due Soon';
    return 'Upcoming';
}

function getNextDueVaccine(child) {
    const nextVaccine = vaccineUtils.getNextVaccine(child.dob, child.vaccines || []);
    return nextVaccine ? `${nextVaccine.name} (${nextVaccine.dose})` : 'Complete';
}

// Search Functions
function searchChildren() {
    displayChildrenList();
}

// Utility Functions
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    toast.classList.add('show');
    
    // Add type-based styling
    if (type === 'error') {
        toast.style.backgroundColor = 'var(--danger-color)';
    } else if (type === 'success') {
        toast.style.backgroundColor = 'var(--success-color)';
    } else if (type === 'warning') {
        toast.style.backgroundColor = 'var(--warning-color)';
    } else {
        toast.style.backgroundColor = 'var(--primary-color)';
    }
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Event Listeners
function setupEventListeners() {
    // Date of birth change updates vaccine checklist
    document.getElementById('childDOB')?.addEventListener('change', function() {
        generateVaccineChecklist();
    });
    
    // Search on Enter
    document.getElementById('searchChild')?.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            searchChildren();
        }
    });
    
    // Form submission prevention
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => e.preventDefault());
    });
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
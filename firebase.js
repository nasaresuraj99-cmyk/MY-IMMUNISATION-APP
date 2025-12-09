// Firebase Configuration - Updated with your credentials
const firebaseConfig = {
    apiKey: "AIzaSyDIu8kdLHPNWyS6vw6Z2x9g_NB0f8jqHCM",
    authDomain: "immunisation-tracker-app.firebaseapp.com",
    databaseURL: "https://immunisation-tracker-app-default-rtdb.firebaseio.com",
    projectId: "immunisation-tracker-app",
    storageBucket: "immunisation-tracker-app.firebasestorage.app",
    messagingSenderId: "292329627020",
    appId: "1:292329627020:web:28cea3653c0d488bb8caa9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase Services
const auth = firebase.auth();
const db = firebase.firestore();
const analytics = firebase.analytics();

// Enable offline persistence
db.enablePersistence()
    .catch((err) => {
        console.error("Firebase persistence error:", err);
    });

// Firebase Collections
const FACILITIES_COLLECTION = 'facilities';
const CHILDREN_COLLECTION = 'children';
const AUDIT_LOGS_COLLECTION = 'auditLogs';
const VACCINE_SCHEDULE_COLLECTION = 'vaccineSchedule';

// Export Firebase services
window.firebaseServices = {
    auth,
    db,
    analytics,
    collections: {
        FACILITIES_COLLECTION,
        CHILDREN_COLLECTION,
        AUDIT_LOGS_COLLECTION,
        VACCINE_SCHEDULE_COLLECTION
    }
};

// WHO EPI 2030 Ghana Vaccine Schedule
const VACCINE_SCHEDULE = [
    { id: 'bcg', name: 'BCG', dueAge: 0, window: [0, 1], dose: 'At Birth' },
    { id: 'opv0', name: 'OPV 0', dueAge: 0, window: [0, 1], dose: 'At Birth' },
    { id: 'hepb0', name: 'Hepatitis B', dueAge: 0, window: [0, 1], dose: 'At Birth' },
    { id: 'opv1', name: 'OPV 1', dueAge: 6, window: [6, 8], dose: '6 weeks' },
    { id: 'penta1', name: 'Penta 1', dueAge: 6, window: [6, 8], dose: '6 weeks' },
    { id: 'pcv1', name: 'PCV 1', dueAge: 6, window: [6, 8], dose: '6 weeks' },
    { id: 'rota1', name: 'Rotavirus 1', dueAge: 6, window: [6, 8], dose: '6 weeks' },
    { id: 'opv2', name: 'OPV 2', dueAge: 10, window: [10, 12], dose: '10 weeks' },
    { id: 'penta2', name: 'Penta 2', dueAge: 10, window: [10, 12], dose: '10 weeks' },
    { id: 'pcv2', name: 'PCV 2', dueAge: 10, window: [10, 12], dose: '10 weeks' },
    { id: 'rota2', name: 'Rotavirus 2', dueAge: 10, window: [10, 12], dose: '10 weeks' },
    { id: 'opv3', name: 'OPV 3', dueAge: 14, window: [14, 16], dose: '14 weeks' },
    { id: 'penta3', name: 'Penta 3', dueAge: 14, window: [14, 16], dose: '14 weeks' },
    { id: 'pcv3', name: 'PCV 3', dueAge: 14, window: [14, 16], dose: '14 weeks' },
    { id: 'rota3', name: 'Rotavirus 3', dueAge: 14, window: [14, 16], dose: '14 weeks' },
    { id: 'ipv1', name: 'IPV 1', dueAge: 14, window: [14, 16], dose: '14 weeks' },
    { id: 'malaria1', name: 'Malaria 1', dueAge: 24, window: [24, 26], dose: '6 months' },
    { id: 'vitamina6', name: 'Vitamin A', dueAge: 24, window: [24, 26], dose: '6 months' },
    { id: 'malaria2', name: 'Malaria 2', dueAge: 28, window: [28, 30], dose: '7 months' },
    { id: 'ipv2', name: 'IPV 2', dueAge: 28, window: [28, 30], dose: '7 months' },
    { id: 'malaria3', name: 'Malaria 3', dueAge: 36, window: [36, 38], dose: '9 months' },
    { id: 'mr1', name: 'Measles Rubella 1', dueAge: 36, window: [36, 38], dose: '9 months' },
    { id: 'malaria4', name: 'Malaria 4', dueAge: 72, window: [72, 74], dose: '18 months' },
    { id: 'mr2', name: 'Measles Rubella 2', dueAge: 72, window: [72, 74], dose: '18 months' },
    { id: 'mena', name: 'Men A', dueAge: 72, window: [72, 74], dose: '18 months' },
    { id: 'llin', name: 'LLIN', dueAge: 72, window: [72, 74], dose: '18 months' }
];

// Vitamin A boosters (every 6 months from 12 months)
for (let age = 48; age <= 240; age += 24) { // 12-60 months in weeks (12m=48w, 60m=240w)
    VACCINE_SCHEDULE.push({
        id: `vitamina_${age}`,
        name: 'Vitamin A',
        dueAge: age,
        window: [age, age + 8],
        dose: `${age/4} months`
    });
}

window.vaccineSchedule = VACCINE_SCHEDULE;

// Helper functions
function calculateAgeInWeeks(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    const diffTime = today - birthDate;
    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
    return diffWeeks;
}

function calculateAgeInMonths(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    const diffMonths = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                      (today.getMonth() - birthDate.getMonth());
    return diffMonths;
}

function getDueVaccines(dob, vaccinesAdministered = []) {
    const ageWeeks = calculateAgeInWeeks(dob);
    const dueVaccines = [];
    
    VACCINE_SCHEDULE.forEach(vaccine => {
        if (ageWeeks >= vaccine.dueAge) {
            const isAdministered = vaccinesAdministered.some(v => 
                v.vaccineId === vaccine.id && v.administered === true
            );
            
            if (!isAdministered) {
                const dueDate = new Date(dob);
                dueDate.setDate(dueDate.getDate() + (vaccine.dueAge * 7));
                
                let status = 'upcoming';
                if (ageWeeks > vaccine.window[1]) {
                    status = 'overdue';
                } else if (ageWeeks >= vaccine.window[0]) {
                    status = 'due';
                }
                
                dueVaccines.push({
                    ...vaccine,
                    dueDate,
                    status,
                    isAdministered
                });
            }
        }
    });
    
    return dueVaccines;
}

function getNextVaccine(dob, vaccinesAdministered = []) {
    const dueVaccines = getDueVaccines(dob, vaccinesAdministered);
    return dueVaccines.find(v => v.status === 'due') || dueVaccines[0];
}

function isChildUpToDate(dob, vaccinesAdministered = []) {
    const dueVaccines = getDueVaccines(dob, vaccinesAdministered);
    return dueVaccines.length === 0;
}

window.vaccineUtils = {
    calculateAgeInWeeks,
    calculateAgeInMonths,
    getDueVaccines,
    getNextVaccine,
    isChildUpToDate
};

// Initialize Firestore Security Rules Check
async function checkFirestoreRules() {
    try {
        // Test write to facilities collection
        const testRef = db.collection('test_rules').doc('test');
        await testRef.set({ test: true });
        await testRef.delete();
        console.log('Firestore rules appear to be working');
        return true;
    } catch (error) {
        console.error('Firestore rules test failed:', error);
        showToast('Warning: Firestore security rules may not be properly configured. Please check Firebase Console.', 'warning');
        return false;
    }
}

// Initialize app with rules check
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        checkFirestoreRules();
    }, 3000);
});
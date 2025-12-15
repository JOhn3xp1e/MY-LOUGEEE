console.log('=== APP STARTING ===');
console.log('Document readyState:', document.readyState);

// Supabase enabled - using Supabase for data storage
import { supabase } from "./supabase.js";

// Default data structure
const defaultData = {
    profile: {
        name: "Lougee Neyra",
        birthday: "March 15, 1999",
        bio: "CRUSH NG LAHAT",
        social: {
            tiktok: "#",
            instagram: "#",
            youtube: "#",
            twitter: "#"
        },
        profilePicture: "images/Lougee Neyra.jpg", // Default profile picture
        updated: new Date().toLocaleDateString()
    },
    settings: {
        theme: "dark",
        sidebarCollapsed: false
    },
    photos: [],
    videos: [],
    notes: [],
    favorites: {
        photos: [],
        videos: [],
        notes: []
    },
    timeline: []
};

// Global AppData - will be loaded from Supabase or localStorage
let AppData = { ...defaultData };
let userId = null;
let useSupabase = false;

// DOM Elements
let sidebar, toggleSidebarBtn, mobileMenuToggle, themeToggle, navLinks, pageContent, pageTitle;
let addPhotoModal, addVideoModal, addNoteModal;

// Initialize DOM elements
function initDOMElements() {
    sidebar = document.getElementById('sidebar');
    toggleSidebarBtn = document.getElementById('toggleSidebar');
    mobileMenuToggle = document.getElementById('mobileMenuToggle');
    themeToggle = document.getElementById('themeToggle');
    navLinks = document.querySelectorAll('.nav-link');
    pageContent = document.getElementById('pageContent');
    pageTitle = document.getElementById('pageTitle');
    
    // Modal elements
    addPhotoModal = document.getElementById('addPhotoModal');
    addVideoModal = document.getElementById('addVideoModal');
    addNoteModal = document.getElementById('addNoteModal');
}

// Clean up old storage keys (for migration purposes)
function cleanupOldStorage() {
    try {
        // Remove old storage keys if they exist
        const oldKeys = ['dashboardData', 'photosData', 'videosData', 'notesData'];
        oldKeys.forEach(key => {
            if (localStorage.getItem(key)) {
                localStorage.removeItem(key);
                console.log(`Removed old storage key: ${key}`);
            }
        });
    } catch (error) {
        console.log('Error cleaning up old storage:', error);
    }
}

// Upload photo to Supabase Storage
async function uploadPhotoToSupabase(file, photoId) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${photoId}.${fileExt}`;
        const filePath = fileName;

        console.log('Uploading photo:', fileName, 'Size:', file.size);

        const { data, error } = await supabase.storage
            .from('photos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (error) {
            console.error('Upload error:', error);
            alert('Upload error: ' + error.message);
            return null;
        }

        console.log('Upload successful, getting public URL...');
        
        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from('photos')
            .getPublicUrl(filePath);

        console.log('Public URL generated:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
        
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('Error uploading photo: ' + error.message);
        return null;
    }
}

// Delete photo from Supabase Storage
async function deletePhotoFromSupabase(photoUrl) {
    try {
        // Extract file path from URL
        const urlParts = photoUrl.split('/object/public/photos/');
        if (urlParts.length < 2) {
            console.log('Invalid photo URL format:', photoUrl);
            return;
        }

        const filePath = urlParts[1];
        console.log('Deleting file from storage:', filePath);

        const { error } = await supabase.storage
            .from('photos')
            .remove([filePath]);

        if (error) {
            console.error('Delete error:', error);
        } else {
            console.log('Photo deleted from storage successfully');
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
    }
}



// Clean data for storage - remove large base64 data
function cleanDataForStorage(data) {
    const cleaned = { ...data };
    
    // Create a deep copy to avoid modifying original
    cleaned.photos = [...(cleaned.photos || [])];
    cleaned.videos = [...(cleaned.videos || [])];
    cleaned.notes = [...(cleaned.notes || [])];
    
    // Limit photos and remove base64 data
    if (cleaned.photos.length > 0) {
        cleaned.photos = cleaned.photos.map(photo => {
            // Create minimal photo object without large base64 data
            const minimalPhoto = {
                id: photo.id,
                title: photo.title || '',
                date: photo.date || '',
                filename: photo.filename || ''
            };
            
            // Keep URL if it's not a large base64 string
            if (photo.url && !photo.url.startsWith('data:image') && photo.url.length < 1000) {
                minimalPhoto.url = photo.url;
            }
            
            return minimalPhoto;
        }).slice(0, 10); // Limit to 10 photos max for localStorage
    }
    
    // Limit other data
    cleaned.videos = cleaned.videos.slice(0, 30);
    cleaned.notes = cleaned.notes.slice(0, 50);
    
    return cleaned;
}

// Save data to localStorage
function saveDataToLocalStorage() {
    try {
        const cleanedData = cleanDataForStorage(AppData);
        const dataStr = JSON.stringify(cleanedData);
        
        // Check if data is too large
        if (dataStr.length > 2 * 1024 * 1024) { // 2MB limit
            console.warn('Data too large, removing old photos');
            
            // Remove oldest photos
            if (AppData.photos.length > 5) {
                AppData.photos = AppData.photos.slice(-5); // Keep only 5 most recent
                alert('Storage was full. Kept only 5 most recent photos to free up space.');
            }
            
            // Try again with reduced data
            const reducedData = cleanDataForStorage(AppData);
            localStorage.setItem('lougeeDashboardData', JSON.stringify(reducedData));
        } else {
            localStorage.setItem('lougeeDashboardData', dataStr);
        }
        
        // Update storage info if on settings page
        if (document.getElementById('settingsPage') && 
            document.getElementById('settingsPage').style.display === 'block') {
            updateStorageInfo();
        }
        
        return true;
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        
        if (error.name === 'QuotaExceededError') {
            console.log('LocalStorage full, using fallback');
            // Try to save minimal data
            const minimalData = {
                settings: AppData.settings,
                profile: AppData.profile,
                photos: [],
                videos: [],
                notes: [],
                favorites: { photos: [], videos: [], notes: [] },
                timeline: []
            };
            localStorage.setItem('lougeeDashboardData', JSON.stringify(minimalData));
            alert('Storage is full. Photos and other large data will not be saved locally.');
        }
        return false;
    }
}

// Load data from localStorage
async function loadDataFromLocalStorage() {
    const savedData = localStorage.getItem('lougeeDashboardData');
    if (savedData) {
        try {
            AppData = JSON.parse(savedData);

            // Ensure all properties exist and merge with defaults
            AppData.photos = AppData.photos || [];
            AppData.videos = AppData.videos || [];
            AppData.notes = AppData.notes || [];
            AppData.favorites = AppData.favorites || { photos: [], videos: [], notes: [] };
            AppData.timeline = AppData.timeline || [];
            AppData.profile = { ...defaultData.profile, ...AppData.profile };
            AppData.settings = { ...defaultData.settings, ...AppData.settings };

            console.log('Data loaded from localStorage');
            return true;
        } catch (error) {
            console.log('Error parsing localStorage data, using default:', error);
            AppData = { ...defaultData };
            saveDataToLocalStorage();
            return false;
        }
    } else {
        // Save default data
        AppData = { ...defaultData };
        saveDataToLocalStorage();
        console.log('Default data saved to localStorage');
        return true;
    }
}

// Load data from Supabase
async function loadDataFromSupabase() {
    try {
        console.log('Loading data from Supabase for user:', userId);

        const { data, error } = await supabase
            .from("profiles")
            .select("data")
            .eq("id", userId)
            .single();

        if (error) {
            console.log('Supabase error details:', {
                code: error.code,
                message: error.message,
                details: error.details,
                hint: error.hint
            });

            // Handle 406 specifically - no row found
            if (error.code === '406' || error.message.includes('406')) {
                // For anonymous users, don't try to create a profile - use local storage instead
                if (userId && userId.startsWith('local-user-')) {
                    console.log('Anonymous user - skipping Supabase profile creation');
                    return false;
                }

                console.log('Creating new profile in Supabase...');
                const { error: insertError } = await supabase
                    .from('profiles')
                    .insert({
                        id: userId,
                        data: defaultData,
                        updated_at: new Date().toISOString()
                    });

                if (insertError) {
                    console.error('Failed to create profile:', insertError);
                    // If profile creation fails due to RLS, disable Supabase for this user
                    if (insertError.message && insertError.message.includes('violates row level security policy')) {
                        console.log('RLS policy violation during profile creation, disabling Supabase');
                        useSupabase = false;
                    }
                    return false;
                }

                console.log('New profile created successfully');
                AppData = { ...defaultData };
                return true;
            }

            return false;
        }

        if (data && data.data) {
            console.log('Data loaded from Supabase');
            AppData = data.data;

            // Ensure all properties exist
            AppData.photos = AppData.photos || [];
            AppData.videos = AppData.videos || [];
            AppData.notes = AppData.notes || [];
            AppData.favorites = AppData.favorites || { photos: [], videos: [], notes: [] };
            AppData.timeline = AppData.timeline || [];

            return true;
        }
        return false;
    } catch (error) {
        console.error('Error loading from Supabase:', error);
        return false;
    }
}

// Save data to Supabase with retry logic
async function saveDataToSupabase(maxRetries = 3) {
    if (!useSupabase || !userId || userId.startsWith('local-user-')) {
        console.log('Supabase not available or anonymous user, skipping cloud save');
        return false;
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // First check if user has an existing profile
            const { data: existingProfile, error: selectError } = await supabase
                .from("profiles")
                .select("id")
                .eq("id", userId)
                .single();

            if (selectError && selectError.code !== '406') {
                // If there's an error other than "not found", log it
                console.log('Error checking existing profile:', selectError);
            }

            const profileExists = !selectError || selectError.code !== '406';

            if (!profileExists) {
                console.log('No existing profile found, skipping Supabase save to avoid RLS violation');
                useSupabase = false; // Disable Supabase for this session
                return false;
            }

            // Clean data before sending to Supabase
            const cleanedData = cleanDataForStorage(AppData);

            // Check data size before sending
            const dataToSend = {
                id: userId,
                data: cleanedData
            };

            const dataString = JSON.stringify(dataToSend);
            if (dataString.length > 800000) { // ~800KB limit for safety
                console.warn('Data too large for Supabase, skipping cloud save');
                return false;
            }

            const { error } = await supabase
                .from("profiles")
                .upsert(dataToSend);

            if (error) {
                console.error(`Supabase save error (attempt ${attempt}/${maxRetries}):`, {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });
                lastError = error;

                // Check if it's an RLS error - if so, disable Supabase for this session
                if (error.message && error.message.includes('violates row level security policy')) {
                    console.log('RLS policy violation detected, disabling Supabase for this session');
                    useSupabase = false;
                    return false;
                }

                // If it's a network error, retry
                if (isNetworkError(error) && attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                    console.log(`Retrying Supabase save in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                return false;
            }

            console.log('Data saved to Supabase successfully');
            return true;

        } catch (error) {
            console.error(`Error saving to Supabase (attempt ${attempt}/${maxRetries}):`, error);
            lastError = error;

            // Check if it's an RLS error - if so, disable Supabase for this session
            if (error.message && error.message.includes('violates row level security policy')) {
                console.log('RLS policy violation detected, disabling Supabase for this session');
                useSupabase = false;
                return false;
            }

            // If it's a network error, retry
            if (isNetworkError(error) && attempt < maxRetries) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                console.log(`Retrying Supabase save in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            return false;
        }
    }

    console.error('All Supabase save attempts failed. Last error:', lastError);
    return false;
}

// Helper function to check if error is network-related
function isNetworkError(error) {
    if (!error) return false;

    const errorMessage = error.message || error.toString();
    const networkErrorPatterns = [
        'Failed to fetch',
        'NetworkError',
        'ERR_CONNECTION_CLOSED',
        'ERR_CONNECTION_RESET',
        'ERR_NETWORK_CHANGED',
        'ERR_INTERNET_DISCONNECTED',
        'timeout',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT'
    ];

    return networkErrorPatterns.some(pattern =>
        errorMessage.includes(pattern) ||
        (error.code && error.code.includes(pattern))
    );
}

// Unified save function
async function saveData() {
    // Always save to localStorage
    saveDataToLocalStorage();

    // Also save to Supabase if available
    if (useSupabase && userId) {
        try {
            const supabaseResult = await saveDataToSupabase();
            if (!supabaseResult) {
                console.log('Supabase save failed or disabled, continuing with localStorage only');
            }
        } catch (error) {
            console.error('Supabase save failed, but localStorage save succeeded:', error);
            // Don't throw error - we still want the function to complete
            // The UI will still update even if cloud save fails
        }
    }
}

// Initialize the application
async function initApp() {
    try {
        console.log('Initializing app...');
        
        // Initialize DOM elements first
        initDOMElements();
        
        // Clean up old storage first
        cleanupOldStorage();
        
        // Try to authenticate with Supabase (non-persistent)
        console.log('Attempting Supabase authentication...');

        // Use localStorage for user ID to avoid rate limits
        let storedUserId = localStorage.getItem('supabase_user_id');
        if (storedUserId && !storedUserId.startsWith('local-user-')) {
            // Only use stored ID if it's a valid UUID (not a local-user ID)
            useSupabase = true;
            userId = storedUserId;
            console.log('Using stored user ID:', userId);
        } else {
            try {
                const { data, error } = await supabase.auth.signInAnonymously();

                if (error) {
                    console.log('Supabase auth failed, using localStorage only:', error.message);
                    useSupabase = false;
                    userId = 'local-user-' + Date.now();
                    // Don't store local-user ID in localStorage to avoid confusion
                } else {
                    useSupabase = true;
                    userId = data.user.id;
                    localStorage.setItem('supabase_user_id', userId);
                    console.log('Supabase authenticated successfully, user ID:', userId);
                }
            } catch (authError) {
                console.log('Auth error, using localStorage:', authError.message);
                useSupabase = false;
                userId = 'local-user-' + Date.now();
            }
        }
        
        // Load data
        if (useSupabase && userId) {
            const supabaseLoaded = await loadDataFromSupabase();
            if (!supabaseLoaded) {
                console.log('Checking localStorage for existing data...');
                await loadDataFromLocalStorage();
            }
        } else {
            await loadDataFromLocalStorage();
        }

        // Setup event listeners
        setupEventListeners();
        setupFullPhotoModal();

        // Update UI
        updateStats();
        applyTheme();
        applySidebarState();

        console.log('App initialized successfully');
        console.log('Using storage:', useSupabase ? 'Supabase' : 'LocalStorage');
    } catch (error) {
        console.error('Error initializing app:', error);
        
        // Fallback to localStorage
        console.log('Falling back to localStorage initialization');
        useSupabase = false;
        userId = 'local-user-' + Date.now();
        localStorage.setItem('supabase_user_id', userId);
        await loadDataFromLocalStorage();
        setupEventListeners();
        updateStats();
        applyTheme();
        applySidebarState();
        
        console.log('App initialized with local storage');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Sidebar toggle
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
    }
    
    // Theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Navigation
    if (navLinks && navLinks.length > 0) {
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const page = this.getAttribute('data-page');
                navigateToPage(page);
                
                // Update active nav link
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
                
                // Close mobile menu if open
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                }
            });
        });
    }
    
    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProfile();
        });
    }


    
    // Quick action buttons
    const addPhotoBtn = document.getElementById('addPhotoBtn');
    if (addPhotoBtn) {
        addPhotoBtn.addEventListener('click', () => openModal(addPhotoModal));
    }
    
    const addVideoBtn = document.getElementById('addVideoBtn');
    if (addVideoBtn) {
        addVideoBtn.addEventListener('click', () => openModal(addVideoModal));
    }
    
    const addNoteBtn = document.getElementById('addNoteBtn');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', () => openModal(addNoteModal));
    }
    
    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) {
        backupBtn.addEventListener('click', backupData);
    }
    
    // Photo form
    const addPhotoForm = document.getElementById('addPhotoForm');
    if (addPhotoForm) {
        addPhotoForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addPhoto();
        });
    }
    
    // Video form
    const addVideoForm = document.getElementById('addVideoForm');
    if (addVideoForm) {
        addVideoForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addVideo();
        });
    }
    
    // Note form
    const addNoteForm = document.getElementById('addNoteForm');
    if (addNoteForm) {
        addNoteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addNote();
        });
    }
    
    // Close modal buttons
    const closePhotoModalBtn = document.getElementById('closePhotoModal');
    if (closePhotoModalBtn) {
        closePhotoModalBtn.addEventListener('click', () => closeModal(addPhotoModal));
    }
    
    const closeVideoModalBtn = document.getElementById('closeVideoModal');
    if (closeVideoModalBtn) {
        closeVideoModalBtn.addEventListener('click', () => closeModal(addVideoModal));
    }
    
    const closeNoteModalBtn = document.getElementById('closeNoteModal');
    if (closeNoteModalBtn) {
        closeNoteModalBtn.addEventListener('click', () => closeModal(addNoteModal));
    }
    
    // Close modals when clicking outside
    window.addEventListener('click', function(e) {
        if (addPhotoModal && e.target === addPhotoModal) closeModal(addPhotoModal);
        if (addVideoModal && e.target === addVideoModal) closeModal(addVideoModal);
        if (addNoteModal && e.target === addNoteModal) closeModal(addNoteModal);
    });
}

// Navigation
function navigateToPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');

    // Show selected page
    const pageElement = document.getElementById(`${page}Page`);
    if (pageElement) {
        pageElement.style.display = 'block';
    }

    // Update page title
    const pageTitles = {
        home: 'Dashboard',
        profile: 'Idol Profile',
        photos: 'Photo Gallery',
        videos: 'Video Collection',
        notes: 'Notes & Facts',
        favorites: 'Favorites',
        timeline: 'Timeline',
        settings: 'Settings'
    };

    if (pageTitle) {
        pageTitle.textContent = pageTitles[page] || 'Dashboard';
    }

    // Load page-specific content
    if (page === 'profile') loadProfilePage();
    else if (page === 'photos') loadPhotosPage();
    else if (page === 'videos') loadVideosPage();
    else if (page === 'notes') loadNotesPage();
    else if (page === 'favorites') loadFavoritesPage();
    else if (page === 'timeline') loadTimelinePage();
    else if (page === 'settings') loadSettingsPage();
}

// Toggle sidebar
function toggleSidebar() {
    if (!sidebar) return;
    
    sidebar.classList.toggle('collapsed');
    AppData.settings.sidebarCollapsed = sidebar.classList.contains('collapsed');
    saveData();

    // Update toggle button icon
    if (toggleSidebarBtn) {
        const icon = toggleSidebarBtn.querySelector('.icon');
        if (sidebar.classList.contains('collapsed')) {
            icon.textContent = '→';
        } else {
            icon.textContent = '←';
        }
    }
}

// Apply saved sidebar state
function applySidebarState() {
    if (sidebar && AppData.settings.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        if (toggleSidebarBtn) {
            toggleSidebarBtn.querySelector('.icon').textContent = '→';
        }
    }
}

// Toggle mobile menu
function toggleMobileMenu() {
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

// Theme functions
function toggleTheme() {
    const body = document.body;
    if (body.classList.contains('light-theme')) {
        body.classList.remove('light-theme');
        AppData.settings.theme = 'dark';
        if (themeToggle) {
            themeToggle.innerHTML = '<span class="icon">🌙</span><span>Dark Mode</span>';
        }
    } else {
        body.classList.add('light-theme');
        AppData.settings.theme = 'light';
        if (themeToggle) {
            themeToggle.innerHTML = '<span class="icon">☀️</span><span>Light Mode</span>';
        }
    }
    saveData();
}

function applyTheme() {
    if (AppData.settings.theme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggle) {
            themeToggle.innerHTML = '<span class="icon">☀️</span><span>Light Mode</span>';
        }
    }
}

// Update stats on home page
function updateStats() {
    const photoCountEl = document.getElementById('photoCount');
    const videoCountEl = document.getElementById('videoCount');
    const noteCountEl = document.getElementById('noteCount');
    const favoriteCountEl = document.getElementById('favoriteCount');
    
    if (photoCountEl) photoCountEl.textContent = AppData.photos.length;
    if (videoCountEl) videoCountEl.textContent = AppData.videos.length;
    if (noteCountEl) noteCountEl.textContent = AppData.notes.length;
    
    const favoriteCount = AppData.favorites.photos.length + 
                         AppData.favorites.videos.length + 
                         AppData.favorites.notes.length;
    if (favoriteCountEl) favoriteCountEl.textContent = favoriteCount;
}

// Profile functions
async function saveProfile() {
    const nameInput = document.getElementById('editName');
    const birthdayInput = document.getElementById('editBirthday');
    const bioInput = document.getElementById('editBio');
    const profilePictureInput = document.getElementById('editProfilePicture');
    const tiktokInput = document.getElementById('editTikTok');
    const instagramInput = document.getElementById('editInstagram');
    const youtubeInput = document.getElementById('editYouTube');
    const twitterInput = document.getElementById('editTwitter');

    if (nameInput) AppData.profile.name = nameInput.value;
    if (birthdayInput) AppData.profile.birthday = birthdayInput.value;
    if (bioInput) AppData.profile.bio = bioInput.value;

    AppData.profile.social = {
        tiktok: tiktokInput ? tiktokInput.value : '#',
        instagram: instagramInput ? instagramInput.value : '#',
        youtube: youtubeInput ? youtubeInput.value : '#',
        twitter: twitterInput ? twitterInput.value : '#'
    };

    // Handle profile picture upload
    if (profilePictureInput && profilePictureInput.files && profilePictureInput.files.length > 0) {
        const file = profilePictureInput.files[0];

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            alert('Profile picture must be less than 2MB');
            return;
        }

        const uploadUrl = await uploadProfilePictureToSupabase(file);
        if (uploadUrl) {
            AppData.profile.profilePicture = uploadUrl;
        } else {
            alert('Failed to upload profile picture. Please try again.');
            return;
        }
    }

    AppData.profile.updated = new Date().toLocaleDateString();

    await saveData();
    updateProfileDisplay();
    alert('Profile updated successfully!');
}

// Remove profile picture
async function removeProfilePicture() {
    if (confirm('Remove profile picture?')) {
        // Delete from Supabase Storage
        await deleteProfilePictureFromSupabase();

        // Remove from profile data
        AppData.profile.profilePicture = null;

        await saveData();
        updateProfileDisplay();
        alert('Profile picture removed!');
    }
}

// Update profile display
function updateProfileDisplay() {
    const profileNameEl = document.getElementById('profileName');
    const profileBirthdayEl = document.getElementById('profileBirthday');
    const profileBioEl = document.getElementById('profileBio');
    const profileUpdatedEl = document.getElementById('profileUpdated');
    const profileAvatarImg = document.getElementById('profileAvatarImg');
    const profileAvatar = document.getElementById('profileAvatar');

    if (profileNameEl) profileNameEl.textContent = AppData.profile.name;
    if (profileBirthdayEl) profileBirthdayEl.textContent = AppData.profile.birthday;
    if (profileBioEl) profileBioEl.textContent = AppData.profile.bio;
    if (profileUpdatedEl) profileUpdatedEl.textContent = AppData.profile.updated;

    // Use uploaded profile picture if available, otherwise default
    const profilePictureUrl = AppData.profile.profilePicture || 'images/Lougee Neyra.jpg';

    if (profileAvatarImg) profileAvatarImg.src = profilePictureUrl;
    if (profileAvatar) profileAvatar.src = profilePictureUrl;

    // Update social links
    const socialLinks = document.querySelectorAll('#socialLinks .social-link');
    socialLinks.forEach((link, index) => {
        const socialTypes = ['tiktok', 'instagram', 'youtube', 'twitter'];
        const socialType = socialTypes[index];
        let socialUrl = AppData.profile.social[socialType];

        if (socialUrl && socialUrl !== '#') {
            // Ensure URL has protocol
            if (!socialUrl.startsWith('http://') && !socialUrl.startsWith('https://')) {
                socialUrl = 'https://' + socialUrl;
            }
            link.href = socialUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.pointerEvents = 'auto';
            link.style.opacity = '1';
            link.style.cursor = 'pointer';
        } else {
            link.href = '#';
            link.target = '';
            link.rel = '';
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.5';
            link.style.cursor = 'default';
        }
    });
}

// Modal functions
function openModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modal) {
    if (modal) {
        modal.style.display = 'none';
        // Reset form
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
    }
}

// Add photo - upload to Supabase Storage
async function addPhoto() {
    const titleInput = document.getElementById('photoTitle');
    const dateInput = document.getElementById('photoDate');
    const fileInput = document.getElementById('photoFile');

    if (!titleInput || !dateInput || !fileInput) return;

    const title = titleInput.value;
    const date = dateInput.value;

    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select an image file');
        return;
    }

    const file = fileInput.files[0];

    if (file.size > 5 * 1024 * 1024) {
        alert('Image file must be less than 5MB');
        return;
    }

    const photoId = Date.now();
    const uploadUrl = await uploadPhotoToSupabase(file, photoId);

    if (!uploadUrl) {
        alert('Failed to upload photo. Please try again.');
        return;
    }

    const newPhoto = {
        id: photoId,
        title,
        date,
        url: uploadUrl,
        filename: file.name,
        size: file.size,
        type: file.type
    };

    AppData.photos.unshift(newPhoto);
    await saveData();
    updateStats();
    closeModal(addPhotoModal);

    if (document.getElementById('photosPage') && document.getElementById('photosPage').style.display === 'block') {
        loadPhotosPage();
    }

    alert('Photo uploaded successfully! (Stored in cloud)');
}

// Add video
function addVideo() {
    const titleInput = document.getElementById('videoTitle');
    const categoryInput = document.getElementById('videoCategory');
    const urlInput = document.getElementById('videoUrl');
    
    if (!titleInput || !categoryInput || !urlInput) return;
    
    const title = titleInput.value;
    const category = categoryInput.value;
    const url = urlInput.value;
    
    const newVideo = {
        id: Date.now(),
        title,
        category,
        url
    };
    
    AppData.videos.unshift(newVideo);
    saveData();
    updateStats();
    closeModal(addVideoModal);
    
    // If on videos page, refresh
    if (document.getElementById('videosPage') && document.getElementById('videosPage').style.display === 'block') {
        loadVideosPage();
    }
    
    alert('Video added successfully!');
}

// Add note
function addNote() {
    const titleInput = document.getElementById('noteTitle');
    const contentInput = document.getElementById('noteContent');
    const categoryInput = document.getElementById('noteCategory');
    
    if (!titleInput || !contentInput || !categoryInput) return;

    const title = titleInput.value;
    const content = contentInput.value;
    const category = categoryInput.value;

    const newNote = {
        id: Date.now(),
        title,
        content,
        category,
        date: new Date().toLocaleDateString()
    };

    AppData.notes.unshift(newNote);
    saveData();
    updateStats();
    closeModal(addNoteModal);

    // If on notes page, refresh
    if (document.getElementById('notesPage') && document.getElementById('notesPage').style.display === 'block') {
        loadNotesPage();
    }

    alert('Note added successfully!');
}

// Load photos page
function loadPhotosPage() {
    const photosPage = document.getElementById('photosPage');
    
    if (!photosPage) return;
    
    // Clear existing content
    photosPage.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = `
        <h2 class="card-title">
            <span class="icon">🖼️</span> Photo Gallery
        </h2>
        <div class="d-flex gap-10 mt-20" style="flex-wrap: wrap;">
            <button class="btn" id="addNewPhotoBtn">
                <span class="icon">+</span> Add New Photo
            </button>
            <button class="btn btn-secondary" id="clearPhotosBtn" ${AppData.photos.length === 0 ? 'disabled' : ''}>
                <span class="icon">🗑️</span> Clear All Photos
            </button>
        </div>
        <p class="mt-10"><small>Storage: ${AppData.photos.length} photos</small></p>
    `;
    photosPage.appendChild(header);
    
    // Create gallery
    if (AppData.photos.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'card text-center';
        emptyMsg.innerHTML = `
            <h3>No photos yet</h3>
            <p>Add your first photo to get started!</p>
        `;
        photosPage.appendChild(emptyMsg);
    } else {
        const gallery = document.createElement('div');
        gallery.className = 'gallery-grid';
        
        AppData.photos.forEach(photo => {
            const photoItem = document.createElement('div');
            photoItem.className = 'gallery-item';
            const isFavorite = AppData.favorites.photos.includes(photo.id);
            
            photoItem.innerHTML = `
                <img src="${photo.url}" alt="${photo.title}" class="gallery-img" loading="lazy" data-action="view-full-photo" data-id="${photo.id}">
                <div class="gallery-overlay">
                    <div class="gallery-title">
                        <h4>${photo.title}</h4>
                        <small>${photo.date}</small>
                    </div>
                    <div class="gallery-actions">
                        <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-action="toggle-favorite" data-type="photos" data-id="${photo.id}">
                            <span class="icon">${isFavorite ? '⭐' : '☆'}</span>
                        </button>
                        <button class="btn-delete" data-action="delete-photo" data-id="${photo.id}">
                            <span class="icon">🗑️</span>
                        </button>
                    </div>
                </div>
            `;

            gallery.appendChild(photoItem);
        });
        
        photosPage.appendChild(gallery);
    }
    
    // Add event listeners after DOM is created
    setTimeout(() => {
        const addNewPhotoBtn = document.getElementById('addNewPhotoBtn');
        if (addNewPhotoBtn) {
            addNewPhotoBtn.addEventListener('click', () => openModal(addPhotoModal));
        }
        
        const clearPhotosBtn = document.getElementById('clearPhotosBtn');
        if (clearPhotosBtn) {
            clearPhotosBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete all photos? This cannot be undone.')) {
                    // Delete from Supabase Storage first
                    AppData.photos.forEach(photo => {
                        if (photo.url && photo.url.includes('supabase')) {
                            deletePhotoFromSupabase(photo.url);
                        }
                    });
                    
                    AppData.photos = [];
                    AppData.favorites.photos = [];
                    saveData();
                    updateStats();
                    loadPhotosPage();
                    alert('All photos deleted!');
                }
            });
        }
        
        // Add event delegation for dynamically created buttons
        photosPage.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            // Prevent multiple clicks
            if (target.hasAttribute('data-processing')) return;
            target.setAttribute('data-processing', 'true');

            const action = target.getAttribute('data-action');
            const type = target.getAttribute('data-type');
            const id = parseInt(target.getAttribute('data-id'));

            if (action === 'toggle-favorite' && type && id) {
                addToFavorites(type, id);
            } else if (action === 'delete-photo' && id) {
                deletePhoto(id);
            }

            // Remove processing flag after a short delay
            setTimeout(() => target.removeAttribute('data-processing'), 100);
        });
    }, 100);
}

// Load videos page
function loadVideosPage() {
    const videosPage = document.getElementById('videosPage');
    
    if (!videosPage) return;
    
    // Clear existing content
    videosPage.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = `
        <h2 class="card-title">
            <span class="icon">🎬</span> Video Collection
        </h2>
        <p>Warning: Ang video na makikita mo dito ay puro kagandahan lamang.</p>
        <button class="btn mt-20" id="addNewVideoBtn">
            <span class="icon">+</span> Add New Video
        </button>
    `;
    videosPage.appendChild(header);
    
    // Create video grid
    if (AppData.videos.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'card text-center';
        emptyMsg.innerHTML = `
            <h3>No videos yet</h3>
            <p>Add your first video to get started!</p>
        `;
        videosPage.appendChild(emptyMsg);
    } else {
        const videoGrid = document.createElement('div');
        videoGrid.className = 'video-grid';
        
        AppData.videos.forEach(video => {
            const videoItem = document.createElement('div');
            videoItem.className = 'video-item';
            const isFavorite = AppData.favorites.videos.includes(video.id);

            // Convert URL to embed URL (YouTube or TikTok)
            let embedUrl = video.url;
            let isTikTok = false;

            if (video.url.includes('youtube.com/watch?v=')) {
                const videoId = video.url.split('v=')[1].split('&')[0];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            } else if (video.url.includes('youtu.be/')) {
                const videoId = video.url.split('youtu.be/')[1].split('?')[0];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            } else if (video.url.includes('tiktok.com/')) {
                isTikTok = true;
                embedUrl = video.url;
            }

            videoItem.innerHTML = `
                <div class="card">
                    <div class="d-flex justify-between align-center">
                        <h4>${video.title}</h4>
                        <div class="video-actions">
                            <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-action="toggle-favorite" data-type="videos" data-id="${video.id}">
                                <span class="icon">${isFavorite ? '⭐' : '☆'}</span>
                            </button>
                            <button class="btn-delete" data-action="delete-video" data-id="${video.id}">
                                <span class="icon">🗑️</span>
                            </button>
                        </div>
                    </div>
                    <p><strong>Category:</strong> ${video.category}</p>
                    <div class="mt-20">
                        ${isTikTok ?
                            `<div class="tiktok-video-container">
                                <p><a href="${embedUrl}" target="_blank" rel="noopener noreferrer">Watch on TikTok ↗</a></p>
                                <p><small>Note: TikTok videos open in a new tab</small></p>
                            </div>` :
                            `<iframe
                                src="${embedUrl}"
                                class="video-embed"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowfullscreen>
                            </iframe>`
                        }
                    </div>
                </div>
            `;

            videoGrid.appendChild(videoItem);
        });
        
        videosPage.appendChild(videoGrid);
    }
    
    // Add event listeners after DOM is created
    setTimeout(() => {
        const addNewVideoBtn = document.getElementById('addNewVideoBtn');
        if (addNewVideoBtn) {
            addNewVideoBtn.addEventListener('click', () => openModal(addVideoModal));
        }
        
        // Add event delegation for dynamically created buttons
        videosPage.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            // Prevent multiple clicks
            if (target.hasAttribute('data-processing')) return;
            target.setAttribute('data-processing', 'true');

            const action = target.getAttribute('data-action');
            const type = target.getAttribute('data-type');
            const id = parseInt(target.getAttribute('data-id'));

            if (action === 'toggle-favorite' && type && id) {
                addToFavorites(type, id);
            } else if (action === 'delete-video' && id) {
                deleteVideo(id);
            }

            // Remove processing flag after a short delay
            setTimeout(() => target.removeAttribute('data-processing'), 100);
        });
    }, 100);
}

// Load notes page
function loadNotesPage() {
    const notesPage = document.getElementById('notesPage');
    
    if (!notesPage) return;
    
    // Clear existing content
    notesPage.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = `
        <h2 class="card-title">
            <span class="icon">📝</span> Notes & Facts
        </h2>
        <p>Mag parinig kana kay Lougee, malolougee ka talaga nyan! </p>
        <button class="btn mt-20" id="addNewNoteBtn">
            <span class="icon">+</span> Add New Note
        </button>
    `;
    notesPage.appendChild(header);
    
    // Create notes grid
    if (AppData.notes.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'card text-center';
        emptyMsg.innerHTML = `
            <h3>No notes yet</h3>
            <p>Add your first note to get started!</p>
        `;
        notesPage.appendChild(emptyMsg);
    } else {
        const notesGrid = document.createElement('div');
        notesGrid.className = 'notes-grid';
        
        AppData.notes.forEach(note => {
            const noteCard = document.createElement('div');
            noteCard.className = 'note-card';
            const isFavorite = AppData.favorites.notes.includes(note.id);

            // Check if content is long enough to need truncation
            const isLongContent = note.content.length > 200;
            const truncatedClass = isLongContent ? 'truncated' : '';
            const readMoreBtn = isLongContent ? '<button class="btn-read-more" data-action="read-more" data-id="' + note.id + '">Read More</button>' : '';

            noteCard.innerHTML = `
                <div class="d-flex justify-between align-center">
                    <h4>${note.title}</h4>
                    <div class="note-actions">
                        <button class="btn-favorite ${isFavorite ? 'active' : ''}" data-action="toggle-favorite" data-type="notes" data-id="${note.id}">
                            <span class="icon">${isFavorite ? '⭐' : '☆'}</span>
                        </button>
                        <button class="btn-delete" data-action="delete-note" data-id="${note.id}">
                            <span class="icon">🗑️</span>
                        </button>
                    </div>
                </div>
                <div class="note-content ${truncatedClass}" data-id="${note.id}">${note.content}</div>
                ${readMoreBtn}
                <div class="d-flex justify-between">
                    <span class="note-category">${note.category}</span>
                    <span class="note-date">${note.date}</span>
                </div>
            `;

            notesGrid.appendChild(noteCard);
        });
        
        notesPage.appendChild(notesGrid);
    }
    
    // Add event listeners after DOM is created
    setTimeout(() => {
        const addNewNoteBtn = document.getElementById('addNewNoteBtn');
        if (addNewNoteBtn) {
            addNewNoteBtn.addEventListener('click', () => openModal(addNoteModal));
        }
        
        // Add event delegation for dynamically created buttons
        notesPage.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            // Prevent multiple clicks
            if (target.hasAttribute('data-processing')) return;
            target.setAttribute('data-processing', 'true');

            const action = target.getAttribute('data-action');
            const type = target.getAttribute('data-type');
            const id = parseInt(target.getAttribute('data-id'));

            if (action === 'toggle-favorite' && type && id) {
                addToFavorites(type, id);
            } else if (action === 'delete-note' && id) {
                deleteNote(id);
            } else if (action === 'read-more' && id) {
                toggleNoteExpansion(id);
            }

            // Remove processing flag after a short delay
            setTimeout(() => target.removeAttribute('data-processing'), 100);
        });
    }, 100);
}

// Load favorites page
function loadFavoritesPage() {
    const favoritesPage = document.getElementById('favoritesPage');
    
    if (!favoritesPage) return;
    
    // Clear existing content
    favoritesPage.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = `
        <h2 class="card-title">
            <span class="icon">⭐</span> Favorites
        </h2>
        <p>Your favorite photos, videos, and notes about Lougee Neyra.</p>
    `;
    favoritesPage.appendChild(header);
    
    // Check if there are any favorites
    const hasFavorites = AppData.favorites.photos.length > 0 || 
                        AppData.favorites.videos.length > 0 || 
                        AppData.favorites.notes.length > 0;
    
    if (!hasFavorites) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'card text-center';
        emptyMsg.innerHTML = `
            <h3>No favorites yet</h3>
            <p>Start adding favorites by clicking the star icon on photos, videos, or notes!</p>
        `;
        favoritesPage.appendChild(emptyMsg);
        return;
    }
    
    // Display favorites by category
    if (AppData.favorites.photos.length > 0) {
        const photoSection = document.createElement('div');
        photoSection.className = 'card';
        photoSection.innerHTML = `<h3><span class="icon">🖼️</span> Favorite Photos</h3>`;

        const favoritesList = document.createElement('div');
        favoritesList.className = 'favorites-list mt-20';

        AppData.favorites.photos.forEach(photoId => {
            const photo = AppData.photos.find(p => p.id === photoId);
            if (photo) {
                const favoriteItem = document.createElement('div');
                favoriteItem.className = 'favorite-item clickable';
                favoriteItem.setAttribute('data-action', 'view-full-photo');
                favoriteItem.setAttribute('data-id', photoId);
                favoriteItem.innerHTML = `
                    <div class="favorite-icon">
                        <span class="icon">🖼️</span>
                    </div>
                    <div class="favorite-content">
                        <h4>${photo.title}</h4>
                        <p class="favorite-date">${photo.date}</p>
                    </div>
                    <button class="btn btn-secondary remove-btn" data-action="remove-favorite" data-type="photos" data-id="${photoId}" title="Remove from favorites">
                        <span class="icon">✕</span>
                    </button>
                `;
                favoritesList.appendChild(favoriteItem);
            }
        });

        photoSection.appendChild(favoritesList);
        favoritesPage.appendChild(photoSection);
    }

    if (AppData.favorites.videos.length > 0) {
        const videoSection = document.createElement('div');
        videoSection.className = 'card';
        videoSection.innerHTML = `<h3><span class="icon">🎬</span> Favorite Videos</h3>`;

        const favoritesList = document.createElement('div');
        favoritesList.className = 'favorites-list mt-20';

        AppData.favorites.videos.forEach(videoId => {
            const video = AppData.videos.find(v => v.id === videoId);
            if (video) {
                const favoriteItem = document.createElement('div');
                favoriteItem.className = 'favorite-item clickable';
                favoriteItem.setAttribute('data-action', 'view-video');
                favoriteItem.setAttribute('data-id', videoId);
                favoriteItem.innerHTML = `
                    <div class="favorite-icon">
                        <span class="icon">🎬</span>
                    </div>
                    <div class="favorite-content">
                        <h4>${video.title}</h4>
                        <p class="favorite-category">${video.category}</p>
                    </div>
                    <button class="btn btn-secondary remove-btn" data-action="remove-favorite" data-type="videos" data-id="${videoId}" onclick="event.stopPropagation()" title="Remove from favorites">
                        <span class="icon">✕</span>
                    </button>
                `;
                favoritesList.appendChild(favoriteItem);
            }
        });

        videoSection.appendChild(favoritesList);
        favoritesPage.appendChild(videoSection);
    }

    if (AppData.favorites.notes.length > 0) {
        const noteSection = document.createElement('div');
        noteSection.className = 'card';
        noteSection.innerHTML = `<h3><span class="icon">📝</span> Favorite Notes</h3>`;

        const favoritesList = document.createElement('div');
        favoritesList.className = 'favorites-list mt-20';

        AppData.favorites.notes.forEach(noteId => {
            const note = AppData.notes.find(n => n.id === noteId);
            if (note) {
                const favoriteItem = document.createElement('div');
                favoriteItem.className = 'favorite-item clickable note-favorite-item';
                favoriteItem.setAttribute('data-action', 'view-note');
                favoriteItem.setAttribute('data-id', noteId);
                favoriteItem.innerHTML = `
                    <div class="favorite-icon">
                        <span class="icon">📝</span>
                    </div>
                    <div class="favorite-content">
                        <h4>${note.title}</h4>
                        <div class="favorite-note-content">${note.content}</div>
                        <div class="favorite-meta">
                            <span class="favorite-category">${note.category}</span>
                            <span class="favorite-date">${note.date}</span>
                        </div>
                    </div>
                    <button class="btn btn-secondary remove-btn" data-action="remove-favorite" data-type="notes" data-id="${noteId}" title="Remove from favorites">
                        <span class="icon">✕</span>
                    </button>
                `;
                favoritesList.appendChild(favoriteItem);
            }
        });

        noteSection.appendChild(favoritesList);
        favoritesPage.appendChild(noteSection);
    }
    
    // Add event delegation for dynamically created buttons
    setTimeout(() => {
        favoritesPage.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            // Prevent multiple clicks
            if (target.hasAttribute('data-processing')) return;
            target.setAttribute('data-processing', 'true');

            const action = target.getAttribute('data-action');
            const type = target.getAttribute('data-type');
            const id = parseInt(target.getAttribute('data-id'));

            if (action === 'remove-favorite' && type && id) {
                removeFavorite(type, id);
            } else if (action === 'view-full-photo' && id) {
                viewFullPhoto(id);
            } else if (action === 'view-video' && id) {
                viewVideo(id);
            } else if (action === 'view-note' && id) {
                viewNote(id);
            }

            // Remove processing flag after a short delay
            setTimeout(() => target.removeAttribute('data-processing'), 100);
        });
    }, 100);
}

// Load timeline page
function loadTimelinePage() {
    const timelinePage = document.getElementById('timelinePage');
    
    if (!timelinePage) return;
    
    // Clear existing content
    timelinePage.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.className = 'card';
    header.innerHTML = `
        <h2 class="card-title">
            <span class="icon">📅</span> Timeline & History
        </h2>
        <p>Important events and milestones in Lougee Neyra's career.</p>
        <p><small>This feature is coming soon!</small></p>
    `;
    timelinePage.appendChild(header);
    
    // Create timeline
    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    
    // Sort timeline by date (newest first)
    const sortedTimeline = [...AppData.timeline].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sortedTimeline.length === 0) {
        timeline.innerHTML = `
            <div class="text-center" style="padding: 40px;">
                <h3>No timeline events yet</h3>
                <p>Timeline feature will be available in a future update!</p>
            </div>
        `;
    } else {
        sortedTimeline.forEach(event => {
            const eventItem = document.createElement('div');
            eventItem.className = 'timeline-item';
            eventItem.innerHTML = `
                <div class="timeline-dot"></div>
                <div class="timeline-date">${event.date}</div>
                <h4>${event.title}</h4>
                <p>${event.description}</p>
            `;
            timeline.appendChild(eventItem);
        });
    }
    
    timelinePage.appendChild(timeline);
}

// Update storage information
function updateStorageInfo() {
    try {
        let used = 0;
        if (localStorage.getItem('lougeeDashboardData')) {
            used = localStorage.getItem('lougeeDashboardData').length;
        }
        
        const total = 5 * 1024 * 1024; // 5MB typical limit
        const available = total - used;
        
        const percent = Math.round((used / total) * 100);
        
        const storageBar = document.getElementById('storageBar');
        const storageUsed = document.getElementById('storageUsed');
        const storageAvailable = document.getElementById('storageAvailable');
        
        if (storageBar) storageBar.style.width = percent + '%';
        if (storageUsed) storageUsed.textContent = Math.round(used / 1024);
        if (storageAvailable) storageAvailable.textContent = Math.round(available / 1024);
        
        // Color based on usage
        if (storageBar) {
            if (percent > 90) {
                storageBar.style.backgroundColor = '#dc3545';
            } else if (percent > 70) {
                storageBar.style.backgroundColor = '#ffc107';
            } else {
                storageBar.style.backgroundColor = '#28a745';
            }
        }
    } catch (e) {
        console.log('Could not calculate storage:', e);
    }
}

// Load profile page
function loadProfilePage() {
    // Populate form fields with current data
    const nameInput = document.getElementById('editName');
    const birthdayInput = document.getElementById('editBirthday');
    const bioInput = document.getElementById('editBio');
    const tiktokInput = document.getElementById('editTikTok');
    const instagramInput = document.getElementById('editInstagram');
    const youtubeInput = document.getElementById('editYouTube');
    const twitterInput = document.getElementById('editTwitter');

    if (nameInput) nameInput.value = AppData.profile.name || '';
    if (birthdayInput) birthdayInput.value = AppData.profile.birthday || '';
    if (bioInput) bioInput.value = AppData.profile.bio || '';

    if (tiktokInput) tiktokInput.value = AppData.profile.social?.tiktok || '';
    if (instagramInput) instagramInput.value = AppData.profile.social?.instagram || '';
    if (youtubeInput) youtubeInput.value = AppData.profile.social?.youtube || '';
    if (twitterInput) twitterInput.value = AppData.profile.social?.twitter || '';

    // Update the display as well
    updateProfileDisplay();
}

// Load settings page
function loadSettingsPage() {
    const settingsPage = document.getElementById('settingsPage');
    
    if (!settingsPage) return;
    
    // Clear existing content
    settingsPage.innerHTML = '';
    
    // Create settings card
    const settingsCard = document.createElement('div');
    settingsCard.className = 'card';
    settingsCard.innerHTML = `
        <h2 class="card-title">
            <span class="icon">⚙️</span> Settings
        </h2>
        
        <div class="form-group">
            <label class="form-label">Theme</label>
            <div class="d-flex gap-10">
                <button class="btn ${AppData.settings.theme === 'dark' ? 'btn-secondary' : ''}" id="darkThemeBtn">
                    Dark Mode
                </button>
                <button class="btn ${AppData.settings.theme === 'light' ? 'btn-secondary' : ''}" id="lightThemeBtn">
                    Light Mode
                </button>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Storage Status</label>
            <p>Currently using: <strong>${useSupabase ? 'Supabase Cloud Storage' : 'Local Browser Storage'}</strong></p>
            <p>Photos stored: <strong>${AppData.photos.length}</strong></p>
            <p>Total items: <strong>${AppData.photos.length + AppData.videos.length + AppData.notes.length}</strong></p>
        </div>
        
        <div class="form-group">
            <label class="form-label">Storage Usage</label>
            <div class="storage-meter">
                <div class="storage-bar" id="storageBar"></div>
            </div>
            <p>Used: <span id="storageUsed">0</span>KB / Available: <span id="storageAvailable">0</span>KB</p>
        </div>
        
        <div class="form-group">
            <label class="form-label">Data Management</label>
            <div class="d-flex gap-10" style="flex-wrap: wrap;">
                <button class="btn" id="exportDataBtn">
                    <span class="icon">💾</span> Export Data
                </button>
                <button class="btn" id="importDataBtn">
                    <span class="icon">📤</span> Import Data
                </button>
                <button class="btn" id="clearPhotosBtnSettings">
                    <span class="icon">🖼️</span> Clear Photos Only
                </button>
                <button class="btn" id="clearDataBtn" style="background-color: #dc3545;">
                    <span class="icon">🗑️</span> Clear All Data
                </button>
            </div>
        </div>
        
        <div class="form-group mt-20">
            <h3>About</h3>
            <p>This dashboard is built with HTML, CSS, and JavaScript. Data is stored in your browser with Supabase cloud backup.</p>
            <p>Version 1.0.2 (Storage Optimized)</p>
            <p><small>Note: Photos are uploaded to cloud storage for permanent access and backed up locally for offline viewing.</small></p>
        </div>
    `;
    
    settingsPage.appendChild(settingsCard);
    
    // Update storage info
    updateStorageInfo();
    
    // Add event listeners after DOM is created
    setTimeout(() => {
        const darkThemeBtn = document.getElementById('darkThemeBtn');
        if (darkThemeBtn) {
            darkThemeBtn.addEventListener('click', () => {
                document.body.classList.remove('light-theme');
                AppData.settings.theme = 'dark';
                saveData();
                alert('Dark theme applied!');
            });
        }

        const lightThemeBtn = document.getElementById('lightThemeBtn');
        if (lightThemeBtn) {
            lightThemeBtn.addEventListener('click', () => {
                document.body.classList.add('light-theme');
                AppData.settings.theme = 'light';
                saveData();
                alert('Light theme applied!');
            });
        }
        
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', backupData);
        }
        
        const importDataBtn = document.getElementById('importDataBtn');
        if (importDataBtn) {
            importDataBtn.addEventListener('click', importData);
        }
        
        const clearPhotosBtnSettings = document.getElementById('clearPhotosBtnSettings');
        if (clearPhotosBtnSettings) {
            clearPhotosBtnSettings.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all photos? This cannot be undone.')) {
                    // Delete from Supabase Storage first
                    AppData.photos.forEach(photo => {
                        if (photo.url && photo.url.includes('supabase')) {
                            deletePhotoFromSupabase(photo.url);
                        }
                    });
                    
                    AppData.photos = [];
                    AppData.favorites.photos = [];
                    saveData();
                    updateStats();
                    alert('All photos cleared!');
                    loadSettingsPage();
                }
            });
        }
        
        const clearDataBtn = document.getElementById('clearDataBtn');
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear ALL data? This will delete everything and cannot be undone.')) {
                    // Delete all photos from Supabase Storage first
                    AppData.photos.forEach(photo => {
                        if (photo.url && photo.url.includes('supabase')) {
                            deletePhotoFromSupabase(photo.url);
                        }
                    });
                    
                    localStorage.clear();
                    sessionStorage.clear();
                    AppData = { ...defaultData };
                    saveData();
                    alert('All data cleared. Refreshing page...');
                    setTimeout(() => location.reload(), 1000);
                }
            });
        }
    }, 100);
}

// Import data function
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // Validate imported data structure
                if (!importedData.profile || !importedData.settings) {
                    throw new Error('Invalid data format');
                }
                
                // Merge imported data with current data
                AppData = {
                    ...AppData,
                    profile: importedData.profile || AppData.profile,
                    settings: importedData.settings || AppData.settings,
                    videos: importedData.videos || AppData.videos,
                    notes: importedData.notes || AppData.notes,
                    favorites: importedData.favorites || AppData.favorites,
                    timeline: importedData.timeline || AppData.timeline
                };
                
                // Don't import photos from backup (they'd be base64 strings)
                
                saveData();
                updateStats();
                alert('Data imported successfully!');
                
                // Refresh current page
                const currentPage = document.querySelector('.page[style*="block"]');
                if (currentPage) {
                    const pageId = currentPage.id;
                    if (pageId === 'settingsPage') loadSettingsPage();
                }
                
            } catch (error) {
                alert('Error importing data: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
}

// Remove favorite
function removeFavorite(type, id) {
    if (confirm('Remove from favorites?')) {
        const index = AppData.favorites[type].indexOf(id);
        if (index > -1) {
            AppData.favorites[type].splice(index, 1);
            // Save data with error handling
            saveData().catch(error => {
                console.error('Error saving after removing favorite:', error);
                // Still update UI even if save fails
            });
            updateStats();
            loadFavoritesPage();
            alert('Removed from favorites!');
        }
    }
}

// Add to favorites
function addToFavorites(type, id) {
    if (!AppData.favorites[type].includes(id)) {
        AppData.favorites[type].push(id);
        saveData();
        updateStats();
        alert('Added to favorites!');
    } else {
        const index = AppData.favorites[type].indexOf(id);
        if (index > -1) {
            AppData.favorites[type].splice(index, 1);
            saveData();
            updateStats();
            alert('Removed from favorites!');
        }
    }
    // Refresh current page to update favorite buttons
    const currentPage = document.querySelector('.page[style*="block"]');
    if (currentPage) {
        const pageId = currentPage.id;
        if (pageId === 'photosPage') loadPhotosPage();
        else if (pageId === 'videosPage') loadVideosPage();
        else if (pageId === 'notesPage') loadNotesPage();
    }
}

// Delete photo
async function deletePhoto(id) {
    if (confirm('Delete this photo?')) {
        const photo = AppData.photos.find(p => p.id === id);
        if (!photo) return;

        // Delete from Supabase Storage if it's a Supabase URL
        if (photo.url && photo.url.includes('supabase')) {
            await deletePhotoFromSupabase(photo.url);
        } else if (photo.url && photo.url.startsWith('blob:')) {
            // Revoke object URL for local files
            URL.revokeObjectURL(photo.url);
        }

        AppData.photos = AppData.photos.filter(p => p.id !== id);
        // Remove from favorites if present
        const favIndex = AppData.favorites.photos.indexOf(id);
        if (favIndex > -1) {
            AppData.favorites.photos.splice(favIndex, 1);
        }
        saveData();
        updateStats();
        loadPhotosPage();
        alert('Photo deleted!');
    }
}

// Delete video
function deleteVideo(id) {
    if (confirm('Delete this video?')) {
        AppData.videos = AppData.videos.filter(v => v.id !== id);
        // Remove from favorites if present
        const favIndex = AppData.favorites.videos.indexOf(id);
        if (favIndex > -1) {
            AppData.favorites.videos.splice(favIndex, 1);
        }
        saveData();
        updateStats();
        loadVideosPage();
        alert('Video deleted!');
    }
}

// Delete note
function deleteNote(id) {
    if (confirm('Delete this note?')) {
        AppData.notes = AppData.notes.filter(n => n.id !== id);
        // Remove from favorites if present
        const favIndex = AppData.favorites.notes.indexOf(id);
        if (favIndex > -1) {
            AppData.favorites.notes.splice(favIndex, 1);
        }
        saveData();
        updateStats();
        loadNotesPage();
        alert('Note deleted!');
    }
}

// Toggle note expansion
function toggleNoteExpansion(id) {
    const noteContent = document.querySelector(`.note-content[data-id="${id}"]`);
    const readMoreBtn = document.querySelector(`[data-action="read-more"][data-id="${id}"]`);

    if (noteContent && readMoreBtn) {
        if (noteContent.classList.contains('expanded')) {
            // Collapse
            noteContent.classList.remove('expanded');
            noteContent.classList.add('truncated');
            readMoreBtn.textContent = 'Read More';
        } else {
            // Expand
            noteContent.classList.add('expanded');
            noteContent.classList.remove('truncated');
            readMoreBtn.textContent = 'Read Less';
        }
    }
}

// Backup data
function backupData() {
    const dataStr = JSON.stringify(AppData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = 'lougee-neyna-backup-' + new Date().toISOString().split('T')[0] + '.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    alert('Data exported successfully!');
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded, starting app...');
    // Start the app with a small delay to ensure everything is ready
    setTimeout(initApp, 100);
});

// View full photo
function viewFullPhoto(id) {
    const photo = AppData.photos.find(p => p.id === id);
    if (!photo) return;

    const fullPhotoModal = document.getElementById('fullPhotoModal');
    const fullPhotoImg = document.getElementById('fullPhotoImg');
    const fullPhotoTitle = document.getElementById('fullPhotoTitle');
    const fullPhotoDate = document.getElementById('fullPhotoDate');

    if (fullPhotoModal && fullPhotoImg && fullPhotoTitle && fullPhotoDate) {
        fullPhotoImg.src = photo.url;
        fullPhotoImg.alt = photo.title;
        fullPhotoTitle.textContent = photo.title;
        fullPhotoDate.textContent = photo.date;
        fullPhotoModal.style.display = 'flex';
    }
}

// View video
function viewVideo(id) {
    const video = AppData.videos.find(v => v.id === id);
    if (!video) return;

    // Create or get video modal
    let videoModal = document.getElementById('videoModal');
    if (!videoModal) {
        videoModal = document.createElement('div');
        videoModal.id = 'videoModal';
        videoModal.className = 'modal';
        videoModal.innerHTML = `
            <div class="modal-content video-modal-content">
                <span class="close" id="closeVideoModal">&times;</span>
                <h2 id="videoModalTitle"></h2>
                <p id="videoModalCategory"></p>
                <div class="video-container">
                    <iframe id="videoModalEmbed" class="video-embed" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            </div>
        `;
        document.body.appendChild(videoModal);

        // Add close event listeners
        const closeBtn = document.getElementById('closeVideoModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeVideoModal);
        }

        videoModal.addEventListener('click', function(e) {
            if (e.target === videoModal) {
                closeVideoModal();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && videoModal.style.display === 'flex') {
                closeVideoModal();
            }
        });
    }

    // Convert URL to embed URL (YouTube or TikTok)
    let embedUrl = video.url;
    if (video.url.includes('youtube.com/watch?v=')) {
        const videoId = video.url.split('v=')[1].split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (video.url.includes('youtu.be/')) {
        const videoId = video.url.split('youtu.be/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (video.url.includes('tiktok.com/')) {
        // For TikTok, we'll use the direct URL since TikTok doesn't have embed codes
        // The iframe will try to load the TikTok page directly
        embedUrl = video.url;
    }

    const videoModalTitle = document.getElementById('videoModalTitle');
    const videoModalCategory = document.getElementById('videoModalCategory');
    const videoModalEmbed = document.getElementById('videoModalEmbed');

    if (videoModalTitle) videoModalTitle.textContent = video.title;
    if (videoModalCategory) videoModalCategory.textContent = `Category: ${video.category}`;
    if (videoModalEmbed) videoModalEmbed.src = embedUrl;

    videoModal.style.display = 'flex';
}

// View note
function viewNote(id) {
    const note = AppData.notes.find(n => n.id === id);
    if (!note) return;

    // Create or get note modal
    let noteModal = document.getElementById('noteModal');
    if (!noteModal) {
        noteModal = document.createElement('div');
        noteModal.id = 'noteModal';
        noteModal.className = 'modal';
        noteModal.innerHTML = `
            <div class="modal-content note-modal-content">
                <span class="close" id="closeNoteModal">&times;</span>
                <h2 id="noteModalTitle"></h2>
                <div class="note-meta">
                    <span id="noteModalCategory"></span>
                    <span id="noteModalDate"></span>
                </div>
                <div class="note-content-full" id="noteModalContent"></div>
            </div>
        `;
        document.body.appendChild(noteModal);

        // Add close event listeners
        const closeBtn = document.getElementById('closeNoteModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeNoteModal);
        }

        noteModal.addEventListener('click', function(e) {
            if (e.target === noteModal) {
                closeNoteModal();
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && noteModal.style.display === 'flex') {
                closeNoteModal();
            }
        });
    }

    const noteModalTitle = document.getElementById('noteModalTitle');
    const noteModalCategory = document.getElementById('noteModalCategory');
    const noteModalDate = document.getElementById('noteModalDate');
    const noteModalContent = document.getElementById('noteModalContent');

    if (noteModalTitle) noteModalTitle.textContent = note.title;
    if (noteModalCategory) noteModalCategory.textContent = note.category;
    if (noteModalDate) noteModalDate.textContent = note.date;
    if (noteModalContent) noteModalContent.textContent = note.content;

    noteModal.style.display = 'flex';
}

// Close full photo modal
function closeFullPhoto() {
    const fullPhotoModal = document.getElementById('fullPhotoModal');
    if (fullPhotoModal) {
        fullPhotoModal.style.display = 'none';
    }
}

// Close video modal
function closeVideoModal() {
    const videoModal = document.getElementById('videoModal');
    if (videoModal) {
        videoModal.style.display = 'none';
        // Stop video by clearing src
        const videoEmbed = document.getElementById('videoModalEmbed');
        if (videoEmbed) {
            videoEmbed.src = '';
        }
    }
}

// Close note modal
function closeNoteModal() {
    const noteModal = document.getElementById('noteModal');
    if (noteModal) {
        noteModal.style.display = 'none';
    }
}

// Setup full photo modal event listeners
function setupFullPhotoModal() {
    const closeFullPhotoBtn = document.getElementById('closeFullPhoto');
    const fullPhotoModal = document.getElementById('fullPhotoModal');

    if (closeFullPhotoBtn) {
        closeFullPhotoBtn.addEventListener('click', closeFullPhoto);
    }

    if (fullPhotoModal) {
        // Close modal when clicking outside the image
        fullPhotoModal.addEventListener('click', function(e) {
            if (e.target === fullPhotoModal) {
                closeFullPhoto();
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && fullPhotoModal.style.display === 'flex') {
                closeFullPhoto();
            }
        });
    }
}

// Make functions available globally for onclick handlers
window.addToFavorites = addToFavorites;
window.removeFavorite = removeFavorite;
window.deletePhoto = deletePhoto;
window.deleteVideo = deleteVideo;
window.deleteNote = deleteNote;
window.backupData = backupData;
window.importData = importData;
window.viewFullPhoto = viewFullPhoto;
window.closeFullPhoto = closeFullPhoto;

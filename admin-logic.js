/**
 * MotiveFlow Admin Dashboard Logic
 * Uses Vanilla JS and Supabase
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // 1. SIMPLE AUTHENTICATION
    // -------------------------------------------------------------------------
    // 🔑 UPDATE YOUR PASSWORD HERE 🔑
    // Change the string below to your desired admin password.
    const ADMIN_PASSWORD = 'motiveflow_admin_2025'; 
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    const passwordInput = document.getElementById('admin-password');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    // Check session storage on load
    if (sessionStorage.getItem('mf_admin_auth') === 'true') {
        loginOverlay.classList.add('hidden');
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (passwordInput.value === ADMIN_PASSWORD) {
            sessionStorage.setItem('mf_admin_auth', 'true');
            loginOverlay.classList.add('hidden');
            loginError.style.display = 'none';
            passwordInput.value = '';
            initDashboard();
        } else {
            loginError.style.display = 'block';
            passwordInput.value = '';
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('mf_admin_auth');
        loginOverlay.classList.remove('hidden');
    });

    // -------------------------------------------------------------------------
    // 2. DASHBOARD INITIALIZATION
    // -------------------------------------------------------------------------
    const categorySelect = document.getElementById('product-category');
    const productForm = document.getElementById('product-form');
    const imageInput = document.getElementById('product-image');
    const imagePreview = document.getElementById('image-preview');
    const noImageIcon = document.getElementById('no-image-icon');
    const submitBtn = document.getElementById('submit-btn');

    // Only load data if authenticated
    if (sessionStorage.getItem('mf_admin_auth') === 'true') {
        initDashboard();
    }

    async function initDashboard() {
        if (!window.supabaseClient) {
            showNotification('Erreur critique: Supabase non initialisé', 'error');
            return;
        }
        await fetchCategories();
    }

    // Load categories from Supabase to populate the dropdown
    async function fetchCategories() {
        // Show loading state in the dropdown
        categorySelect.innerHTML = '<option value="" disabled selected>Chargement des catégories en cours...</option>';
        categorySelect.disabled = true;

        try {
            const { data, error } = await window.supabaseClient
                .from('categories')
                .select('id, name')
                .order('name');
            
            if (error) throw error;
            
            categorySelect.innerHTML = '<option value="" disabled selected>Sélectionnez une catégorie...</option>';
            data.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erreur chargement catégories:', error);
            categorySelect.innerHTML = '<option value="" disabled selected>Erreur réseau/Invalid Path</option>';
            showNotification('Erreur lors du chargement des catégories. Vérifiez la configuration de l\'URL Supabase.', 'error');
        } finally {
            // Re-enable the dropdown even if loading failed to let users see the error state
            categorySelect.disabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // 3. IMAGE PREVIEW WIDGET
    // -------------------------------------------------------------------------
    imageInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('L\'image est trop volumineuse (Max: 5MB)', 'error');
                this.value = '';
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
                noImageIcon.style.display = 'none';
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            noImageIcon.style.display = 'block';
        }
    });

    // -------------------------------------------------------------------------
    // 4. FORM SUBMISSION (UPLOAD + INSERT)
    // -------------------------------------------------------------------------
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Form references
        const name = document.getElementById('product-name').value.trim();
        const sku = document.getElementById('product-sku').value.trim();
        const price = parseFloat(document.getElementById('product-price').value);
        const categoryId = document.getElementById('product-category').value;
        const isActive = document.getElementById('product-active').checked;
        const file = imageInput.files[0];

        if (!file) {
            showNotification('Veuillez sélectionner une image.', 'warning');
            return;
        }

        if (!categoryId) {
            showNotification('Veuillez sélectionner une catégorie.', 'warning');
            return;
        }

        // 🚨 SECURITY CHECK: Ensure they haven't bypassed the overlay
        if (sessionStorage.getItem('mf_admin_auth') !== 'true') {
            showNotification('Non autorisé. Veuillez vous connecter.', 'error');
            loginOverlay.classList.remove('hidden');
            return;
        }

        // Lock form during upload
        setLoadingState(true);

        try {
            // Step A: Upload image to Supabase Storage
            // Generate filename: products/timestamp-filename.ext
            const fileExt = file.name.split('.').pop().toLowerCase();
            const fileName = `products/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await window.supabaseClient
                .storage
                .from('product-images')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);

            // Step B: Insert into Database
            // Note: path corresponds to the relative path in the bucket like 'products/filename.jpg'
            const newProduct = {
                category_id: categoryId,
                name: name,
                price: price,
                sku: sku,
                image_url: fileName, // Matching the schema structure setup in index.html/supabase.js
                is_active: isActive
            };

            const { data: insertData, error: insertError } = await window.supabaseClient
                .from('products')
                .insert([newProduct])
                .select();

            if (insertError) throw new Error(`Erreur d'insertion: ${insertError.message}`);

            // Step C: Success!
            showNotification('Produit ajouté avec succès!', 'success');
            
            // Reset form
            productForm.reset();
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            noImageIcon.style.display = 'block';
            
        } catch (error) {
            console.error('Save error:', error);
            showNotification(error.message, 'error');
        } finally {
            setLoadingState(false);
        }
    });

    function setLoadingState(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Ajouter le Produit</span> <i class="fas fa-plus-circle"></i>';
        }
    }

    // -------------------------------------------------------------------------
    // 5. NOTIFICATION SYSTEM
    // -------------------------------------------------------------------------
    const notification = document.getElementById('admin-notification');
    const notifMessage = document.getElementById('notif-message');
    const notifIcon = document.getElementById('notif-icon');
    let notifTimeout;

    function showNotification(message, type = 'success') {
        notifMessage.textContent = message;
        
        // Reset classes
        notification.className = 'notification';
        
        if (type === 'success') {
            notification.classList.add('notification-success');
            notifIcon.className = 'fas fa-check-circle';
        } else if (type === 'error') {
            notification.classList.add('notification-error');
            notifIcon.className = 'fas fa-exclamation-circle';
        } else if (type === 'warning') {
            notification.classList.add('notification-warning');
            notifIcon.className = 'fas fa-exclamation-triangle';
        }
        
        // Show
        notification.classList.add('show');
        
        // Auto hide
        clearTimeout(notifTimeout);
        notifTimeout = setTimeout(() => {
            notification.classList.remove('show');
        }, 4000);
    }
});

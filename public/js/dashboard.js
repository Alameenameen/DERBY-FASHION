// public/js/dashboard.js

// Initialize sales chart
let salesChart = new Chart(document.getElementById('salesChart'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Sales',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});

// Function to update sales chart
async function updateSalesChart(filterType) {
    try {
        const response = await fetch(`/admin/sales-data/${filterType}`);
        const data = await response.json();
        
        salesChart.data.labels = data.labels;
        salesChart.data.datasets[0].data = data.data;
        salesChart.update();
    } catch (error) {
        console.error('Error fetching sales data:', error);
    }
}

// Function to load top items
async function loadTopItems() {
    try {
        // Fetch top products
        const productsResponse = await fetch('/admin/top-products');
        const products = await productsResponse.json();
        const productsHtml = products.map((item, index) => `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h6 class="mb-0">${index + 1}. ${item.productDetails.productName}</h6>
                    <small class="text-muted">Quantity: ${item.totalQuantity}</small>
                </div>
                <div class="text-end">
                    <strong>₹${item.totalRevenue.toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
        document.getElementById('topProducts').innerHTML = productsHtml;

        // Fetch top categories
        const categoriesResponse = await fetch('/admin/top-categories');
        const categories = await categoriesResponse.json();
        const categoriesHtml = categories.map((item, index) => `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h6 class="mb-0">${index + 1}. ${item.categoryDetails.name}</h6>
                    <small class="text-muted">Quantity: ${item.totalQuantity}</small>
                </div>
                <div class="text-end">
                    <strong>₹${item.totalRevenue.toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
        document.getElementById('topCategories').innerHTML = categoriesHtml;

        // Fetch top brands
        const brandsResponse = await fetch('/admin/top-brands');
        const brands = await brandsResponse.json();
        const brandsHtml = brands.map((item, index) => `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h6 class="mb-0">${index + 1}. ${item.brandDetails.brandName}</h6>
                    <small class="text-muted">Quantity: ${item.totalQuantity}</small>
                </div>
                <div class="text-end">
                    <strong>₹${item.totalRevenue.toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
        document.getElementById('topBrands').innerHTML = brandsHtml;

    } catch (error) {
        console.error('Error fetching top items:', error);
    }
}

// Event listeners for filter buttons
document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', (e) => {
        // Remove active class from all buttons
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to clicked button
        e.target.classList.add('active');
        
        // Update chart with selected filter
        updateSalesChart(e.target.dataset.filter);
    });
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    updateSalesChart('weekly'); // Default to weekly view
    loadTopItems();
});
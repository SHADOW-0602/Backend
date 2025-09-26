// Utility functions for consistent formatting across the app

exports.formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
};

exports.formatDate = (date) => {
    return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(new Date(date));
};
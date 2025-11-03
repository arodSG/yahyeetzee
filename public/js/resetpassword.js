import { getQueryParam, createToastMessage } from './global.js';

let resetPasswordSubmitButtonTooltip;

$(document).ready(function() {
    console.log(document.referrer);
    handleInputChange();

    $('#reset-password-input').on('input', function() {
        handleInputChange();
    });

    $('#reset-password-submit-button').on('click', function(e) {
        e.preventDefault();
        const token = getQueryParam('token');
        console.log(token);
        const newPassword = $('#reset-password-input').val();
    
        $('#reset-password-submit-button').prop('disabled', true);
        $('#reset-password-submit-button-text').addClass('d-none');
        $('#reset-password-submit-button-spinner').removeClass('d-none');
    
        $.ajax({
            url: '/auth/resetpassword',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ token, password: newPassword }),
            success: function(data) {
                $('#heading, #reset-controls').fadeOut(100, () => {
                    $('#reset-successful').fadeIn(100);
                });
                $('#reset-password-submit-button-text').removeClass('d-none');
                $('#reset-password-submit-button-spinner').addClass('d-none');
            },
            error: function(xhr) {
                console.log(xhr);
                const response = JSON.parse(xhr.responseText);
                createToastMessage(`Error: ${response.message}`, true);
                $('#reset-password-submit-button').prop('disabled', false);
                $('#reset-password-submit-button-text').removeClass('d-none');
                $('#reset-password-submit-button-spinner').addClass('d-none');
            }
        });
    });

    $('#reset-password-login-button').on('click', function() {
        window.location.href = '/login';
    });
});

function handleInputChange() {
    const requiredFields = ['reset-password-input'];
    const disableButton = requiredFields.some(fieldName => !$(`#${fieldName}`).val());
    const tooltipTitle = 'All fields are required';
  
    $('#reset-password-submit-button').prop('disabled', disableButton);
    $('#reset-password-submit-button-wrapper').prop('title', disableButton ? tooltipTitle : '');
  
    if(!disableButton && resetPasswordSubmitButtonTooltip) {
        resetPasswordSubmitButtonTooltip.dispose();
        resetPasswordSubmitButtonTooltip = null;
    }
  
    if(disableButton && !resetPasswordSubmitButtonTooltip) {
        resetPasswordSubmitButtonTooltip = new bootstrap.Tooltip($('#reset-password-submit-button-wrapper')[0]);
    }
  }
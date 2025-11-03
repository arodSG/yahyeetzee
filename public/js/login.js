import { createToastMessage } from './global.js';

let loginButtonTooltip;
let signupButtonTooltip;
let forgotPasswordSubmitButtonTooltip;

$(document).ready(function() {
  $('#main-container').removeClass('d-none');

  handleLoginInputChange();
  handleSignupInputChange();
  handleForgotPasswordInputChange();

  $('#login-username-input, #login-password-input').on('input', function() {
    handleLoginInputChange();
  });

  $('#signup-username-input, #signup-password-input, #signup-confirm-password-input, #signup-email-input').on('input', function() {
    handleSignupInputChange();
  });

  $('#forgot-password-username-input').on('input', function() {
    handleForgotPasswordInputChange();
  });

  $('.pass-input').on('focusout', function() {
    if(!$(this).val()) {
      $(this).attr('type', 'password');
    }
  });

  $('#login-button').on('click', function(e) {
    e.preventDefault();
    const username = $('#login-username-input').val();
    const password = $('#login-password-input').val();

    $('#login-button').prop('disabled', true);
    $('#login-button-text').addClass('d-none');
    $('#login-button-spinner').removeClass('d-none');

    $.ajax({
      url: '/auth/login',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username, password }),
      success: function(data) {
        $('#login-button-text').removeClass('d-none');
        $('#login-button-spinner').addClass('d-none');
        sessionStorage.setItem('redirectedAfterLogin', true);
        // window.location.href = document.referrer || '/';
        window.location.href = '/';
      },
      error: function(xhr) {
        const response = JSON.parse(xhr.responseText);
        createToastMessage(`Error: ${response.message}`, true);
        $('#login-button').prop('disabled', false);
        $('#login-button-text').removeClass('d-none');
        $('#login-button-spinner').addClass('d-none');
      }
    });
  });

  $('#signup-button').on('click', function(e) {
    e.preventDefault();
    const username = $('#signup-username-input').val();
    const email = $('#signup-email-input').val();
    const password = $('#signup-password-input').val();
    const confirmPassword = $('#signup-confirm-password-input').val();
    const isUsernameValid = validateUsername(username);
    const isPasswordValid = validatePassword(password);

    if(!isUsernameValid) {
      createToastMessage('Error: Username is invalid', true);
    }
    else if(!isPasswordValid) {
      createToastMessage('Error: Password requirements not met', true);
    }
    else if(password !== confirmPassword) {
      createToastMessage('Error: Passwords do not match', true);
    }
    else {
      $('#returning-user-login-button').prop('disabled', true);
      $('#signup-button').prop('disabled', true);
      $('#signup-button-text').addClass('d-none');
      $('#signup-button-spinner').removeClass('d-none');

      $.ajax({
        url: '/auth/signup',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ username, email, password }),
        success: function(data) {
          $('#heading, #controls-container').fadeOut(100, () => {
            $('#signup-successful-email').text(email);
            $('#signup-successful-info').fadeIn(100);
          });
          $('#signup-button-text').removeClass('d-none');
          $('#signup-button-spinner').addClass('d-none');
        },
        error: function(xhr) {
          const response = JSON.parse(xhr.responseText);
          createToastMessage(`Error: ${response.message}`, true);
          $('#returning-user-login-button').prop('disabled', false);
          $('#signup-button').prop('disabled', false);
          $('#signup-button-text').removeClass('d-none');
          $('#signup-button-spinner').addClass('d-none');
        }
      });
    }
  });

  $('#forgot-password-submit-button').on('click', function() {
    const username = $('#forgot-password-username-input').val();

    $('#forgot-password-submit-button').prop('disabled', true);
    $('#forgot-password-submit-button-text').addClass('d-none');
    $('#forgot-password-submit-button-spinner').removeClass('d-none');

    $.ajax({
      url: '/auth/forgotpassword',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username }),
      success: function(data) {
        $('#heading, #controls-container').fadeOut(100, () => {
          $('#forgot-password-successful-info').fadeIn(100);
        });
        $('#forgot-password-submit-button-text').removeClass('d-none');
        $('#forgot-password-submit-button-spinner').addClass('d-none');
      },
      error: function(xhr) {
        const response = JSON.parse(xhr.responseText);
        createToastMessage(`Error: ${response.message}`, true);
        $('#forgot-password-submit-button').prop('disabled', false);
        $('#forgot-password-submit-button-text').removeClass('d-none');
        $('#forgot-password-submit-button-spinner').addClass('d-none');
      }
    });
  });

  $('#new-user-signup-button').on('click', function() {
    $('#heading, #login-controls').fadeOut(100, () => {
      $(document).attr('title', 'Yahyeetzee 🎲 Sign Up');
      $('#heading').text('Sign Up').fadeIn(100);
      $('#signup-controls').fadeIn(100);
    });
  });

  $('#returning-user-login-button').on('click', function() {
    $('#heading, #signup-controls').fadeOut(100, () => {
      $(document).attr('title', 'Yahyeetzee 🎲 Log In');
      $('#heading').text('Log In').fadeIn(100);
      $('#login-controls').fadeIn(100);
    });
  });

  $('#forgot-password-button').on('click', function() {
    $('#heading, #login-controls').fadeOut(100, () => {
      $(document).attr('title', 'Yahyeetzee 🎲 Forgot Password');
      $('#heading').text('Forgot Password').fadeIn(100);
      $('#forgot-password-controls').fadeIn(100);
    });
  });

  $('#forgot-password-back-button').on('click', function() {
    $('#heading, #forgot-password-controls').fadeOut(100, () => {
      $(document).attr('title', 'Yahyeetzee 🎲 Log In');
      $('#heading').text('Log In').fadeIn(100);
      $('#login-controls').fadeIn(100);
    });
  });

  if(Cookies.get('redirectedAfterVerification')) {
    createToastMessage('Email verified, log in to continue', false);
    Cookies.remove('redirectedAfterVerification');
  }
});

function handleLoginInputChange() {
  const requiredFields = ['login-username-input', 'login-password-input'];
  const disableButton = requiredFields.some(fieldName => !$(`#${fieldName}`).val());
  const trimmedUsername = $('#login-username-input').val().replace(/\s+/g, '');
  const tooltipTitle = 'All fields are required';

  $('#login-username-input').val(trimmedUsername);
  $('#login-button').prop('disabled', disableButton);
  $('#login-button-wrapper').prop('title', disableButton ? tooltipTitle : '');

  if(!disableButton && loginButtonTooltip) {
    loginButtonTooltip.dispose();
    loginButtonTooltip = null;
  }

  if(disableButton && !loginButtonTooltip) {
    loginButtonTooltip = new bootstrap.Tooltip($('#login-button-wrapper')[0]);
  }
}

function handleSignupInputChange() {
  const requiredFields = ['signup-username-input', 'signup-password-input', 'signup-confirm-password-input', 'signup-email-input'];
  const disableButton = requiredFields.some(fieldName => !$(`#${fieldName}`).val());
  const trimmedUsername = $('#signup-username-input').val().replace(/\s+/g, '');
  const usernameLength = trimmedUsername.length;
  const tooltipTitle = 'All fields are required';

  $('#signup-username-input').val(trimmedUsername);
  $('#signup-username-num-characters').text(usernameLength);
  $('#signup-button').prop('disabled', disableButton);
  $('#signup-button-wrapper').prop('title', disableButton ? tooltipTitle : '');

  if(!disableButton && signupButtonTooltip) {
    signupButtonTooltip.dispose();
    signupButtonTooltip = null;
  }

  if(disableButton && !signupButtonTooltip) {
    signupButtonTooltip = new bootstrap.Tooltip($('#signup-button-wrapper')[0]);
  }
}

function handleForgotPasswordInputChange() {
  const requiredFields = ['forgot-password-username-input'];
  const disableButton = requiredFields.some(fieldName => !$(`#${fieldName}`).val());
  const trimmedUsername = $('#forgot-password-username-input').val().replace(/\s+/g, '');
  const tooltipTitle = 'All fields are required';

  $('#forgot-password-username-input').val(trimmedUsername);
  $('#forgot-password-submit-button').prop('disabled', disableButton);
  $('#forgot-password-submit-button-wrapper').prop('title', disableButton ? tooltipTitle : '');

  if(!disableButton && forgotPasswordSubmitButtonTooltip) {
    forgotPasswordSubmitButtonTooltip.dispose();
    forgotPasswordSubmitButtonTooltip = null;
  }

  if(disableButton && !forgotPasswordSubmitButtonTooltip) {
    forgotPasswordSubmitButtonTooltip = new bootstrap.Tooltip($('#forgot-password-submit-button-wrapper')[0]);
  }
}

function validateUsername(username) {
  return /^[a-zA-Z0-9]*$/.test(username) && username.length >= 3;
}

function validatePassword(password) {
  return /[a-zA-Z]/.test(password) && /[0-9]/.test(password) && password.length >= 8;
}
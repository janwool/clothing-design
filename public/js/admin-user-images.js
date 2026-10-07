(() => {
  document.querySelectorAll('.user-upload-preview img').forEach(image => {
    function showFailure() {
      image.hidden = true;
      const fallback = image.parentElement.querySelector('.user-image-fallback');
      if (fallback) fallback.hidden = false;
    }
    image.addEventListener('error', showFailure, { once: true });
    if (image.complete && !image.naturalWidth) showFailure();
  });
})();

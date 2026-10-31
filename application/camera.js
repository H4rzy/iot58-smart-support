'use strict';

// Optional local webcam: images never enter the MQTT/vision control pipeline.
(() => {
  const $ = (id) => document.getElementById(id);
  const MAX_PHOTOS = 20;
  let stream = null;
  let starting = false;
  let busy = false;
  let online = false;
  let generation = 0;
  let viewGeneration = 0;
  let photoUrl = null;
  let tickets = [];
  let database;
  const video = $('webcam-video');
  const selection = $('webcam-ticket');
  const status = (message) => { $('webcam-status').textContent = message; };

  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('Trình duyệt không hỗ trợ lưu ảnh IndexedDB.'));
      const request = indexedDB.open('huit-iot58-ticket-photos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'ticket_id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Không mở được kho ảnh cục bộ.'));
      request.onblocked = () => reject(new Error('Đóng tab Dashboard cũ rồi thử lại.'));
    });
    return database;
  }

  async function store(mode, action) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction('photos', mode);
      let result;
      const request = action(tx.objectStore('photos'));
      if (request) request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(new Error('Không lưu/đọc được ảnh. Kiểm tra dung lượng và quyền trình duyệt.'));
    });
  }

  function controls() {
    const active = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
    $('webcam-start').disabled = active || starting;
    $('webcam-stop').disabled = !active && !starting;
    $('webcam-capture').disabled = !active || video.readyState < 2 || !selection.value || !online || busy;
    selection.disabled = busy;
    $('webcam-delete').disabled = busy;
    $('webcam-clear').disabled = busy;
    $('webcam-badge').textContent = active ? 'WEBCAM TRỰC TIẾP' : starting ? 'CHỜ QUYỀN CAMERA' : 'CAMERA TẮT';
    $('webcam-badge').className = `badge badge-${active ? 'green' : 'neutral'}`;
  }

  function stop(message = 'Camera đã tắt. Ảnh đã chụp vẫn được lưu cục bộ.') {
    generation++;
    starting = false;
    const old = stream;
    stream = null;
    old?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.hidden = true;
    $('webcam-placeholder').hidden = false;
    controls();
    status(message);
  }

  async function start() {
    const attempt = ++generation;
    starting = true;
    controls();
    status('Đang xin quyền truy cập webcam; không yêu cầu microphone.');
    let acquired;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error('Mở Dashboard bằng http://localhost:1880 hoặc HTTPS để dùng camera.');
      acquired = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (attempt !== generation) { acquired.getTracks().forEach((track) => track.stop()); return; }
      stream = acquired;
      video.srcObject = stream;
      video.hidden = false;
      $('webcam-placeholder').hidden = true;
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (stream === acquired) stop('Camera bị ngắt. Bạn có thể bật lại; queue vẫn hoạt động.'); });
      await video.play();
      if (attempt !== generation) return;
      status('Webcam đang bật. Chọn ticket rồi bấm chụp; ảnh không tự động gửi đi.');
    } catch (error) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (attempt !== generation) return;
      const messages = {
        NotAllowedError: 'Quyền camera bị từ chối. Cho phép camera tại biểu tượng quyền của trình duyệt rồi thử lại.',
        NotFoundError: 'Không tìm thấy webcam. Cắm camera rồi thử lại; demo queue vẫn chạy.',
        NotReadableError: 'Không mở được webcam. Đóng ứng dụng khác đang dùng camera rồi thử lại.'
      };
      stop(messages[error.name] || error.message);
    } finally {
      if (attempt === generation) { starting = false; controls(); }
    }
  }

  function clearPreview() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    $('webcam-photo').removeAttribute('src');
    $('webcam-download').removeAttribute('href');
    $('webcam-snapshot').hidden = true;
  }

  async function showPhoto() {
    const version = ++viewGeneration;
    const id = selection.value;
    clearPreview();
    if (!id) return;
    try {
      const photo = await store('readonly', (photos) => photos.get(id));
      if (version !== viewGeneration || id !== selection.value || !photo) return;
      photoUrl = URL.createObjectURL(photo.blob);
      $('webcam-photo').src = photoUrl;
      $('webcam-photo-title').textContent = `${photo.ticket_id} · ${photo.device_id} · ${photo.intent}`;
      $('webcam-photo-time').textContent = `Chụp ${new Date(photo.captured_at).toLocaleString('vi-VN')} · Chỉ lưu trên trình duyệt này`;
      $('webcam-download').href = photoUrl;
      $('webcam-download').download = `${photo.ticket_id.replace(/[^\w-]/g, '_')}-webcam.jpg`;
      $('webcam-snapshot').hidden = false;
    } catch (error) { status(error.message); }
  }

  async function capture() {
    const ticket = tickets.find((item) => item.ticket_id === selection.value);
    if (!ticket || !stream || video.readyState < 2 || !online || busy) return;
    busy = true;
    controls();
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) throw new Error('Không lấy được khung hình. Thử bật lại camera.');
      // Clear old entries and put the new photo in one atomic transaction.
      const photos = await store('readonly', (items) => items.getAll());
      const obsolete = photos.filter((photo) => photo.ticket_id !== ticket.ticket_id)
        .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at)).slice(MAX_PHOTOS - 1);
      await store('readwrite', (items) => {
        obsolete.forEach((photo) => items.delete(photo.ticket_id));
        return items.put({ ticket_id: ticket.ticket_id, device_id: ticket.device_id, intent: ticket.intent,
          captured_at: new Date().toISOString(), blob });
      });
      await showPhoto();
      status(`Đã lưu ảnh cho ${ticket.ticket_id} trong trình duyệt này.`);
    } catch (error) { status(error.message); }
    finally { busy = false; controls(); }
  }

  document.addEventListener('iot58:state', (event) => {
    online = true;
    tickets = event.detail.tickets || [];
    const previous = selection.value;
    const values = tickets.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const signature = JSON.stringify(values.map((t) => [t.ticket_id, t.state]));
    if (selection.dataset.signature !== signature) {
      selection.dataset.signature = signature;
      selection.replaceChildren(new Option(values.length ? 'Chọn ticket để chụp hoặc xem ảnh' : 'Chưa có ticket — nhấn nút A/B/C trước', ''),
        ...values.map((t) => new Option(`${t.ticket_id} · ${t.device_id} · ${t.state}`, t.ticket_id)));
      selection.value = values.some((t) => t.ticket_id === previous) ? previous : '';
      if (selection.value !== previous) { viewGeneration++; clearPreview(); }
    }
    controls();
  });
  document.addEventListener('iot58:offline', () => { online = false; controls(); status('API mất kết nối: tạm khóa chụp gắn ticket. Camera và ảnh cục bộ vẫn có thể tắt/xóa.'); });
  selection.addEventListener('change', () => { controls(); void showPhoto(); });
  video.addEventListener('loadeddata', controls);
  $('webcam-start').addEventListener('click', () => void start());
  $('webcam-stop').addEventListener('click', () => stop());
  $('webcam-capture').addEventListener('click', () => void capture());
  $('webcam-delete').addEventListener('click', async () => {
    if (busy || !selection.value) return;
    busy = true; controls();
    try { await store('readwrite', (photos) => photos.delete(selection.value)); await showPhoto(); status('Đã xóa ảnh ticket khỏi trình duyệt.'); }
    catch (error) { status(error.message); }
    finally { busy = false; controls(); }
  });
  $('webcam-clear').addEventListener('click', async () => {
    if (busy || !window.confirm('Xóa toàn bộ ảnh webcam đã lưu trên trình duyệt này?')) return;
    busy = true; controls();
    try { await store('readwrite', (photos) => photos.clear()); viewGeneration++; clearPreview(); status('Đã xóa toàn bộ ảnh webcam cục bộ.'); }
    catch (error) { status(error.message); }
    finally { busy = false; controls(); }
  });
  window.addEventListener('pagehide', () => { stop(); clearPreview(); });
  window.addEventListener('pageshow', () => { controls(); if (selection.value) void showPhoto(); });
  controls();
})();

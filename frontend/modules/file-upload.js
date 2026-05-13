/**
 * 文件上传模块
 * 负责文件的上传、预览和管理
 * @module file-upload
 */

// 文件上传状态已在 globals.js 中定义

let lastUploadFile = null; // 记录上次上传失败的文件，用于重试

/**
 * 更新上传进度条
 * @param {number} percent - 进度百分比 (0-100)
 * @param {string} status - 状态文本
 * @param {string} statusType - 状态类型 (uploading, success, error)
 * @param {boolean} showRetry - 是否显示重试按钮
 */
function updateUploadProgress(percent, status = '', statusType = '', showRetry = false) {
  const progressBar = document.getElementById('ai-upload-progress');
  const progressFill = document.getElementById('ai-upload-progress-bar');
  const progressText = document.getElementById('ai-upload-progress-text');
  const statusEl = document.getElementById('ai-upload-status');

  if (progressBar && progressFill && progressText) {
    progressBar.style.display = 'flex';
    progressFill.style.setProperty('--progress', `${percent}%`);
    progressText.textContent = `${Math.round(percent)}%`;

    if (percent < 100) {
      progressFill.classList.add('uploading');
    } else {
      progressFill.classList.remove('uploading');
    }
  }

  if (statusEl && status) {
    statusEl.style.display = 'flex';
    statusEl.textContent = status;
    statusEl.className = 'ai-upload-status';
    if (statusType) {
      statusEl.classList.add(statusType);
    }

    // 添加重试按钮
    if (showRetry && lastUploadFile) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'ai-upload-retry-btn';
      retryBtn.textContent = '重新上传';
      retryBtn.onclick = () => retryUpload();
      statusEl.appendChild(retryBtn);
    }
  }
}

/**
 * 重试上传上次失败的文件
 */
function retryUpload() {
  if (!lastUploadFile) return;

  const file = lastUploadFile;
  lastUploadFile = null;

  // 重新触发上传
  isUploading = true;
  updateUploadButtonState();
  updateUploadProgress(0, '准备重新上传...', 'uploading');

  uploadFileToServer(file).then(result => {
    if (result && result.success && result.files && result.files.length > 0) {
      const uploadedFile = result.files[0];
      uploadedFiles = [{
        fileId: uploadedFile.fileId,
        fileName: file.name
      }];
      updateUploadProgress(100, '上传完成！', 'success');
      showFilePreview(file.name, true);
      showToast('文件上传成功');
      setTimeout(hideUploadProgress, 3000);
    } else {
      let errorMsg = result?.message || '未知错误';
      if (errorMsg.startsWith('文件上传失败: ')) {
        errorMsg = errorMsg.replace('文件上传失败: ', '');
      }
      updateUploadProgress(0, '上传失败: ' + errorMsg, 'error', true);
      lastUploadFile = file;
    }
  }).catch(error => {
    console.error('[FileUpload] 重试上传失败:', error);
    updateUploadProgress(0, '上传失败: ' + error.message, 'error', true);
    lastUploadFile = file;
  }).finally(() => {
    isUploading = false;
    updateUploadButtonState();
  });
}

/**
 * 隐藏上传进度条
 */
function hideUploadProgress() {
  const progressBar = document.getElementById('ai-upload-progress');
  const statusEl = document.getElementById('ai-upload-status');

  if (progressBar) {
    progressBar.style.display = 'none';
  }
  if (statusEl) {
    statusEl.style.display = 'none';
  }
}

/**
 * 处理文件选择
 * @param {Event} event - 文件选择事件
 */
async function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];

  if (file.size > FILE_LIMITS.MAX_SIZE) {
    showToast('文件大小超过50MB限制');
    event.target.value = '';
    return;
  }

  // 检查当前会话是否是工作流会话
  const currentSession = SessionManager.getCurrentSession();
  const isWorkflow = currentSession?.dialogType === 'workflow';

  if (isWorkflow) {
    // 工作流会话：直接保存文件信息，不调用上传接口
    const reader = new FileReader();
    reader.onload = function(e) {
      const arrayBuffer = e.target.result;
      uploadedFiles = [{
        fileName: file.name,
        fileType: file.type,
        fileData: Array.from(new Uint8Array(arrayBuffer)),
        isWorkflowFile: true // 标记为工作流文件
      }];
      lastUploadFile = null;
      showFilePreview(file.name, true);
      showToast('文件已选择');
    };
    reader.onerror = function() {
      showToast('文件读取失败');
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
    return;
  }

  // 非工作流会话：调用上传接口
  showFilePreview(file.name, false);

  isUploading = true;
  updateUploadButtonState();
  updateUploadProgress(0, '准备上传...', 'uploading');

  try {
    const result = await uploadFileToServer(file);
    if (result && result.success && result.files && result.files.length > 0) {
      const uploadedFile = result.files[0];
      uploadedFiles = [{
        fileId: uploadedFile.fileId,
        fileName: file.name
      }];
      lastUploadFile = null;
      updateUploadProgress(100, '上传完成！', 'success');
      showFilePreview(file.name, true);
      showToast('文件上传成功');

      setTimeout(hideUploadProgress, 3000);
    } else {
      let errorMsg = result?.message || '未知错误';
      if (errorMsg.startsWith('文件上传失败: ')) {
        errorMsg = errorMsg.replace('文件上传失败: ', '');
      }

      // code 9999 服务器错误，显示重试按钮
      if (result?.code === 9999 || result?.code === '9999') {
        lastUploadFile = file;
        updateUploadProgress(0, '上传失败: ' + errorMsg, 'error', true);
      } else {
        updateUploadProgress(0, '上传失败: ' + errorMsg, 'error');
      }
      hideFilePreview();
      showToast('文件上传失败: ' + errorMsg);
    }
  } catch (error) {
    console.error('[FileUpload] 文件上传失败:', error);
    lastUploadFile = file;
    updateUploadProgress(0, '上传失败: ' + error.message, 'error', true);
    hideFilePreview();
    showToast('文件上传失败: ' + error.message);
  } finally {
    isUploading = false;
    updateUploadButtonState();
    event.target.value = '';
  }
}

/**
 * 上传文件到后端服务器
 * @param {File} file - 要上传的文件
 * @param {string|null} agentId - 目标智能体ID
 * @returns {Promise<Object>} 上传结果
 */
async function uploadFileToServer(file, agentId = null) {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();
    
    if (!agentId) {
      const currentSession = SessionManager.getCurrentSession();
      agentId = currentSession?.agentType || AGENT_IDS.CHAT;
    }

    const reader = new FileReader();

    let progressInterval = setInterval(() => {
      const currentProgress = parseFloat(document.getElementById('ai-upload-progress-bar')?.style.getPropertyValue('--progress') || 0);
      let newProgress = currentProgress;
      let statusText = '正在上传...';

      if (currentProgress < 30) {
        newProgress = Math.min(currentProgress + Math.random() * 8 + 3, 30);
      } else if (currentProgress < 70) {
        newProgress = Math.min(currentProgress + Math.random() * 5 + 2, 70);
        statusText = '正在传输...';
      } else if (currentProgress < 99) {
        newProgress = Math.min(currentProgress + 0.5, 99);
        statusText = '服务器处理中...';
      }

      updateUploadProgress(newProgress, statusText, 'uploading');
    }, 200);

    reader.onload = function(e) {
      updateUploadProgress(30, '正在传输...', 'uploading');

      const arrayBuffer = e.target.result;

      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.UPLOAD_FILE,
        requestId: requestId,
        agentId: agentId,
        dialogId: SessionManager.getCurrentDialogId(),
        fileName: file.name,
        fileType: file.type,
        fileData: Array.from(new Uint8Array(arrayBuffer))
      }, (response) => {
        clearInterval(progressInterval);

        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.success) {
          resolve({
            success: true,
            files: response.files
          });
        } else {
          reject(new Error(response?.error || '上传失败'));
        }
      });
    };

    reader.onprogress = function(e) {
      if (e.lengthComputable) {
        const fileReadPercent = (e.loaded / e.total) * 30;
        updateUploadProgress(fileReadPercent, '正在读取文件...', 'uploading');
      }
    };

    reader.onerror = function() {
      clearInterval(progressInterval);
      reject(new Error('文件读取失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * 显示文件预览
 * @param {string} fileName - 文件名
 * @param {boolean} uploaded - 是否已上传完成
 */
function showFilePreview(fileName, uploaded = false) {
  const previewEl = document.getElementById('ai-file-preview');
  const nameEl = document.getElementById('ai-file-name');

  if (previewEl && nameEl) {
    nameEl.textContent = fileName;
    previewEl.style.display = 'block';
  }

  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    if (uploaded) {
      uploadBtn.title = '已上传文件，点击×移除后可重新上传';
    } else {
      uploadBtn.title = '正在上传中...';
    }
  }
}

/**
 * 隐藏文件预览区域
 */
function hideFilePreview() {
  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.title = '上传文件';
  }
}

/**
 * 移除已上传的文件
 */
function removeUploadedFile() {
  uploadedFiles = [];

  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.title = '上传文件';
  }

  showToast('已移除文件');
}

/**
 * 更新上传按钮状态
 */
function updateUploadButtonState() {
  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = isUploading || uploadedFiles.length > 0;
    if (isUploading) {
      uploadBtn.innerHTML = '⏳';
    } else {
      uploadBtn.innerHTML = '📎';
    }
  }
}

/**
 * 清空文件上传状态
 */
function clearFileUploadState() {
  uploadedFiles = [];
  isUploading = false;

  const previewEl = document.getElementById('ai-file-preview');
  if (previewEl) {
    previewEl.style.display = 'none';
  }

  const uploadBtn = document.getElementById('ai-upload-file-btn');
  if (uploadBtn) {
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '📎';
    uploadBtn.title = '上传文件';
  }

  const fileInput = document.getElementById('ai-file-input');
  if (fileInput) {
    fileInput.value = '';
  }
}

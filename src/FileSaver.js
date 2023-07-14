/*
* FileSaver.js
* A saveAs() FileSaver implementation.
*
* By Eli Grey, http://eligrey.com
*
* License : https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md (MIT)
* source  : http://purl.eligrey.com/github/FileSaver.js
*/

// The one and only way of getting global scope in all environments
// 在所有环境中获得全局范围的唯一 _global
// https://stackoverflow.com/q/3277182/1008999
var _global = typeof window === 'object' && window.window === window
  ? window : typeof self === 'object' && self.self === self
    ? self : typeof global === 'object' && global.global === global
      ? global
      : this;

function bom (blob, opts) {
  if (typeof opts === 'undefined') opts = { autoBom: false };
  else if (typeof opts !== 'object') {
    console.warn('Deprecated: Expected third argument to be a object');
    opts = { autoBom: !opts };
  }

  // prepend BOM for UTF-8 XML and text/* types (including HTML)
  // 为UTF-8 XML和text/*类型（包括HTML）准备BOM
  // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
  // 注意：您的浏览器将自动将UTF-16 U+FEFF转换为EF BB BF
  if (opts.autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
    return new Blob([String.fromCharCode(0xFEFF), blob], { type: blob.type });
  }
  return blob;
}

function download (url, name, opts) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  // 设置返回数据的类型为blob
  xhr.responseType = 'blob';
  // 资源完成下载
  xhr.onload = function () {
    // 获取响应的blob对象
    saveAs(xhr.response, name, opts);
  };
  xhr.onerror = function () {
    console.error('could not download file');
  };
  xhr.send();
}

function corsEnabled (url) {
  var xhr = new XMLHttpRequest();
  // use sync to avoid popup blocker
  // 使用同步来避免弹出窗口阻塞
  xhr.open('HEAD', url, false);
  try {
    xhr.send();
  } catch (e) {}
  return xhr.status >= 200 && xhr.status <= 299;
}

// `a.click()` doesn't work for all browsers (#465)
function click (node) {
  try {
    node.dispatchEvent(new MouseEvent('click'));
  } catch (e) {
    var evt = document.createEvent('MouseEvents');
    evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80,
      20, false, false, false, false, 0, null);
    node.dispatchEvent(evt);
  }
}

// Detect WebView inside a native macOS app by ruling out all browsers
// 通过排除所有浏览器，在本机macOS应用程序中检测WebView
// We just need to check for 'Safari' because all other browsers (besides Firefox) include that too
// 我们只需要检查“Safari”，因为所有其他浏览器（除了Firefox）也包括它
// https://www.whatismybrowser.com/guides/the-latest-user-agent/macos
var isMacOSWebView = _global.navigator && /Macintosh/.test(navigator.userAgent) && /AppleWebKit/.test(navigator.userAgent) && !/Safari/.test(navigator.userAgent);

var saveAs = _global.saveAs || (
  // probably in some web worker
  // 可能是某个网络工作者
  (typeof window !== 'object' || window !== _global)
    ? function saveAs () { /* noop */ }

    // Use download attribute first if possible (#193 Lumia mobile) unless this is a macOS WebView
    // 如果可能，请首先使用下载属性（#193 Lumia mobile），除非这是 macOS WebView
    : (
      ('download' in HTMLAnchorElement.prototype && !isMacOSWebView)
        ? function saveAs (blob, name, opts) {
          var URL = _global.URL || _global.webkitURL;
          // Namespace is used to prevent conflict w/ Chrome Poper Blocker extension (Issue #561)
          // 命名空间用于防止与Chrome Poper Blocker扩展发生冲突（Issue#561）
          var a = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
          // 设置下载的文件名字
          name = name || blob.name || 'download';

          a.download = name;
          // 解决安全问题，新页面的 window.opener 指向前一个页面的 window 对象
          // 使用 noopener 使 window.opener 获取的值为 null
          a.rel = 'noopener'; // tabnabbing

          // TODO: detect chrome extensions & packaged apps
          // a.target = '_blank'
          if (typeof blob === 'string') {
            // Support regular links
            // 支持常规链接
            a.href = blob;
            // console.log('a.origin !== location.origin', a.origin !== location.origin);
            // console.log('corsEnabled(a.href)', corsEnabled(a.href));
            if (a.origin !== location.origin) {
              corsEnabled(a.href)
                ? download(blob, name, opts)
                : click(a, a.target = '_blank');
            } else {
              click(a);
            }
          } else {
            // Support blobs
            // 创建一个 DOMString 指向这个 blob
            // 简单理解就是为这个 blob 对象生成一个可访问的链接
            a.href = URL.createObjectURL(blob);
            // 40s后移除这个临时链接
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4E4); // 40s
            // 触发a标签，执行下载
            setTimeout(function () { click(a); }, 0);
          }
        }

        // Use msSaveOrOpenBlob as a second approach
        // 使用 msSaveOrOpenBlob 作为第二种方法
        : (
          'msSaveOrOpenBlob' in navigator
            ? function saveAs (blob, name, opts) {
              name = name || blob.name || 'download';

              if (typeof blob === 'string') {
                if (corsEnabled(blob)) {
                  download(blob, name, opts);
                } else {
                  var a = document.createElement('a');
                  a.href = blob;
                  a.target = '_blank';
                  setTimeout(function () { click(a); });
                }
              } else {
                navigator.msSaveOrOpenBlob(bom(blob, opts), name);
              }
            }

          // Fallback to using FileReader and a popup
          // 回退到使用 FileReader 和弹出窗口
            : function saveAs (blob, name, opts, popup) {
              // Open a popup immediately do go around popup blocker
              // 立即打开弹出窗口，绕过弹出窗口阻止程序
              // Mostly only available on user interaction and the fileReader is async so...
              // 大多数只在用户交互时可用，fileReader是异步的，所以。。。
              popup = popup || open('', '_blank');
              if (popup) {
                popup.document.title = popup.document.body.innerText = 'downloading...';
              }

              if (typeof blob === 'string') return download(blob, name, opts);

              var force = blob.type === 'application/octet-stream';
              var isSafari = /constructor/i.test(_global.HTMLElement) || _global.safari;
              var isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent);

              if ((isChromeIOS || (force && isSafari) || isMacOSWebView) && typeof FileReader !== 'undefined') {
                // Safari doesn't allow downloading of blob URLs
                // Safari不允许下载blob URL
                var reader = new FileReader();
                reader.onloadend = function () {
                  var url = reader.result;
                  url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, 'data:attachment/file;');
                  if (popup) popup.location.href = url;
                  else location = url;
                  popup = null; // reverse-tabnabbing #460
                };
                reader.readAsDataURL(blob);
              } else {
                var URL = _global.URL || _global.webkitURL;
                var url = URL.createObjectURL(blob);
                if (popup) popup.location = url;
                else location.href = url;
                popup = null; // reverse-tabnabbing #460
                setTimeout(function () { URL.revokeObjectURL(url); }, 4E4); // 40s
              }
            }
        )
    )
);

_global.saveAs = saveAs.saveAs = saveAs;

if (typeof module !== 'undefined') {
  module.exports = saveAs;
}

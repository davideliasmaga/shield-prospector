// SHIELD Prospector v3 - Content Script

function detectContext() {
  var url = window.location.href;
  if (url.includes('/sales/lead/') || url.includes('/sales/people/')) return 'salesnav_profile';
  if (url.includes('/sales/')) return 'salesnav_other';
  if (url.includes('/in/')) return 'linkedin_profile';
  if (url.includes('/messaging/')) return 'linkedin_messaging';
  return 'other';
}

function trySelectors(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    try {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var text = (els[j].innerText || els[j].textContent || '').trim();
        if (text && text.length > 1) return text;
      }
    } catch(e) {}
  }
  return '';
}

function extractProfileData() {
  var ctx = detectContext();
  var data = {
    name: '', headline: '', currentRole: '', currentCompany: '',
    location: '', about: '', recentPosts: [],
    url: window.location.href, source: ctx
  };

  if (ctx === 'salesnav_profile') {
    extractSalesNavProfile(data);
  } else {
    extractLinkedInProfile(data);
  }

  // Fallback: parse headline if role/company still empty
  if (!data.currentRole && data.headline) {
    var seps = [' at ', ' na ', ' en ', ' @ '];
    for (var i = 0; i < seps.length; i++) {
      if (data.headline.includes(seps[i])) {
        var parts = data.headline.split(seps[i]);
        data.currentRole = parts[0].trim();
        data.currentCompany = parts.slice(1).join(seps[i]).trim();
        break;
      }
    }
    if (!data.currentRole) data.currentRole = data.headline;
  }

  return data;
}

function extractLinkedInProfile(data) {
  // NAME
  data.name = trySelectors([
    'h1.text-heading-xlarge',
    'h1.inline.t-24',
    '.pv-text-details__left-panel h1',
    '.ph5 h1',
    'h1[class*="t-24"]',
    'h1[class*="heading"]',
    'section.artdeco-card h1'
  ]);

  // HEADLINE
  data.headline = trySelectors([
    '.text-body-medium.break-words',
    '.pv-text-details__left-panel .text-body-medium',
    '[data-generated-suggestion-target]',
    '.ph5 .text-body-medium',
    '.pv-top-card--list .text-body-medium'
  ]);

  // LOCATION
  data.location = trySelectors([
    '.text-body-small.inline.t-black--light.break-words',
    '.pv-text-details__left-panel .text-body-small',
    '.ph5 span.text-body-small'
  ]);

  // ABOUT - find section with About/Sobre heading
  var sections = document.querySelectorAll('section');
  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var headings = sec.querySelectorAll('h2, h3, div[id], #about');
    for (var j = 0; j < headings.length; j++) {
      var hText = (headings[j].innerText || headings[j].id || '').toLowerCase().trim();
      if (hText === 'about' || hText === 'sobre' || hText === 'acerca de') {
        var spans = sec.querySelectorAll('span[aria-hidden="true"]');
        for (var k = 0; k < spans.length; k++) {
          var t = spans[k].innerText.trim();
          if (t.length > 30) { data.about = t.substring(0, 500); break; }
        }
        break;
      }
    }
    if (data.about) break;
  }

  // EXPERIENCE - current role + company
  var expAnchor = document.querySelector('#experience');
  if (expAnchor) {
    var expSection = expAnchor.closest('section') || expAnchor.parentElement;
    if (expSection) {
      var items = expSection.querySelectorAll('li');
      if (items.length > 0) {
        var firstItem = items[0];
        var boldSpans = firstItem.querySelectorAll('.t-bold span[aria-hidden="true"]');
        if (boldSpans.length > 0) data.currentRole = boldSpans[0].innerText.trim();

        var normalSpans = firstItem.querySelectorAll('.t-14.t-normal:not(.t-black--light) span[aria-hidden="true"]');
        if (normalSpans.length > 0) {
          data.currentCompany = normalSpans[0].innerText.trim().split('\u00b7')[0].trim();
        }

        // Broader fallback
        if (!data.currentRole) {
          var allSpans = firstItem.querySelectorAll('span[aria-hidden="true"]');
          for (var k = 0; k < allSpans.length; k++) {
            var t = allSpans[k].innerText.trim();
            if (t.length > 3 && t.length < 100) {
              if (!data.currentRole) data.currentRole = t;
              else if (!data.currentCompany && t !== data.currentRole) { data.currentCompany = t; break; }
            }
          }
        }
      }
    }
  }

  // RECENT POSTS
  var postEls = document.querySelectorAll(
    '.feed-shared-update-v2__description .break-words, .update-components-text .break-words'
  );
  for (var p = 0; p < postEls.length && data.recentPosts.length < 3; p++) {
    var pt = postEls[p].innerText.trim();
    if (pt.length > 20) data.recentPosts.push(pt.substring(0, 300));
  }
}

function extractSalesNavProfile(data) {
  data.name = trySelectors([
    '.profile-topcard-person-entity__name',
    'h1[data-anonymize="person-name"]',
    '.artdeco-entity-lockup__title',
    '[data-x--lead-detail-name]'
  ]);
  data.headline = trySelectors([
    '[data-anonymize="headline"]',
    '.profile-topcard-person-entity__headline',
    '.artdeco-entity-lockup__subtitle'
  ]);
  data.currentCompany = trySelectors([
    '[data-anonymize="company-name"]',
    '.profile-topcard-person-entity__company'
  ]);
  data.location = trySelectors([
    '[data-anonymize="location"]',
    '.profile-topcard-person-entity__location'
  ]);
  if (data.headline && !data.currentRole) data.currentRole = data.headline;
}

function extractMessageHistory() {
  var messages = [];
  var msgSelectors = [
    '.msg-s-event-listitem__body',
    '.msg-s-message-list-content .msg-s-event__content'
  ];
  for (var s = 0; s < msgSelectors.length; s++) {
    var els = document.querySelectorAll(msgSelectors[s]);
    if (els.length > 0) {
      for (var i = 0; i < Math.min(els.length, 20); i++) {
        var text = (els[i].innerText || '').trim();
        if (text) {
          var listItem = els[i].closest('.msg-s-event-listitem');
          var isOutgoing = listItem ? !listItem.classList.contains('msg-s-event-listitem--other') : true;
          messages.push({ direction: isOutgoing ? 'sent' : 'received', text: text.substring(0, 500) });
        }
      }
      if (messages.length > 0) break;
    }
  }
  return messages;
}

function detectLanguage(profileData) {
  var text = [profileData.headline, profileData.about, profileData.location, profileData.currentCompany].join(' ').toLowerCase();
  var esWords = ['espana', 'mexico', 'colombia', 'argentina', 'chile', 'peru', 'venezuela',
    'ecuador', 'guatemala', 'costa rica', 'panama', 'gerente', 'director', 'madrid', 'barcelona'];
  var ptWords = ['brasil', 'brazil', 'sao paulo', 'rio de janeiro', 'belo horizonte',
    'curitiba', 'brasilia', 'porto alegre', 'diretor', 'pagamentos'];
  var esScore = 0, ptScore = 0;
  for (var i = 0; i < esWords.length; i++) if (text.includes(esWords[i])) esScore++;
  for (var i = 0; i < ptWords.length; i++) if (text.includes(ptWords[i])) ptScore++;
  return esScore > ptScore ? 'es' : 'pt';
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'extractData') {
    try {
      var profileData = extractProfileData();
      var messageHistory = extractMessageHistory();
      var language = detectLanguage(profileData);
      sendResponse({ profileData: profileData, messageHistory: messageHistory, language: language, pageUrl: window.location.href });
    } catch(e) {
      sendResponse({ error: e.message });
    }
  }
  return true;
});

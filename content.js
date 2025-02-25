// content.js
console.log('Content script loaded');

let isInitialized = false;

// Parse a package into a structured object
function parsePackage(pkg) {
  const heading = pkg.querySelector('.package-heading');
  const username = heading.querySelector('a')?.textContent || '';
  const total = heading.querySelector('strong')?.textContent || '';
  
  // Extract just the percentage part from efficiency
  const efficiencyElement = heading.querySelector('.efficiency-index');
  const efficiencyText = efficiencyElement?.textContent || '';
  // Extract just the percentage (e.g., from "85% of $527.30" to "85")
  const percentageMatch = efficiencyText.match(/(\d+)%/);
  const efficiencyPercentage = percentageMatch ? percentageMatch[1] : '';
  
  const cards = [...pkg.querySelectorAll('.package-body li')]
    .filter(li => !li.classList.contains('more'))
    .map(li => ({
      name: li.querySelector('a')?.textContent || '',
      condition: li.querySelector('.condition')?.textContent || '',
      price: li.querySelector('strong')?.textContent || '',
      quantity: li.textContent.match(/(\d+)x/)?.[1] || '1'
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
    
  return {
    username,
    total,
    efficiencyText,
    efficiencyPercentage,
    cards
  };
}

// Create a unique identifier that only uses username and cards list
// This will only change if the cards or the sender changes
function getBasePackageKey(pkgObj) {
  const cardSignatures = pkgObj.cards
    .map(card => `${card.quantity}x ${card.name} ${card.condition}`)
    .join('|');
    
  return `${pkgObj.username}-${cardSignatures}`;
}

// Create a key that includes percentage
function getPackageKeyWithPercentage(pkgObj) {
  return `${getBasePackageKey(pkgObj)}-${pkgObj.efficiencyPercentage}`;
}

// Create a full key including price
function getFullPackageKey(pkgObj) {
  const cardSignatures = pkgObj.cards
    .map(card => `${card.quantity}x ${card.name} ${card.condition} ${card.price}`)
    .join('|');
    
  return `${pkgObj.username}-${pkgObj.total}-${pkgObj.efficiencyPercentage}-${cardSignatures}`;
}

async function initializeState() {
  if (isInitialized) {
    console.log('Already initialized, skipping');
    return;
  }

  const packages = [...document.getElementsByClassName('cs-package')];
  if (packages.length === 0) {
    console.log('No packages found, waiting...');
    return;
  }

  // Parse all current packages
  const currentPackages = packages.map(pkg => parsePackage(pkg));
  
  // Get previously stored state
  const result = await browser.storage.local.get(['packageData']);
  const prevPackages = result.packageData || [];
  console.log('Loaded previous packages:', prevPackages.length);

  // Create lookup maps for faster comparison
  const prevBasePackageMap = new Map();
  const prevPackageWithPercentageMap = new Map();
  
  prevPackages.forEach(pkg => {
    const baseKey = getBasePackageKey(pkg);
    const percentageKey = getPackageKeyWithPercentage(pkg);
    const fullKey = getFullPackageKey(pkg);
    
    prevBasePackageMap.set(baseKey, {
      percentageKey,
      fullKey,
      pkg
    });
    
    prevPackageWithPercentageMap.set(percentageKey, {
      fullKey,
      pkg
    });
  });

  // Analyze each current package
  currentPackages.forEach((currPkg, index) => {
    const pkgElement = packages[index];
    const baseKey = getBasePackageKey(currPkg);
    const percentageKey = getPackageKeyWithPercentage(currPkg);
    const fullKey = getFullPackageKey(currPkg);
    
    // Check if the package (username + cards) exists
    if (!prevBasePackageMap.has(baseKey)) {
      // This is a truly new package
      pkgElement.classList.add('package-new');
      console.log('New package:', currPkg.username);
    } else {
      // The package exists, check if percentage changed
      const prevData = prevBasePackageMap.get(baseKey);
      
      if (prevData.percentageKey !== percentageKey) {
        // Percentage offer changed
        pkgElement.classList.add('package-offer-changed');
        console.log('Offer changed:', currPkg.username, 
                   'from', prevData.pkg.efficiencyPercentage + '%', 
                   'to', currPkg.efficiencyPercentage + '%');
      } else if (prevData.fullKey !== fullKey) {
        // Only price changed (due to index price updates)
        pkgElement.classList.add('package-price-changed');
        console.log('Price changed:', currPkg.username);
      }
    }
  });

  // Save current state
  await browser.storage.local.set({ packageData: currentPackages });
  isInitialized = true;
  console.log('State initialized');
}

// Inject CSS
const style = document.createElement('style');
style.textContent = `
  .packages .cs-package.package-new {
    background-color: rgba(144, 238, 144, 0.15) !important;
    border-left: 4px solid #4CAF50 !important;
    border-radius: 0 !important;
  }
  
  .packages .cs-package.package-offer-changed {
    background-color: rgba(173, 216, 230, 0.15) !important;
    border-left: 4px solid #2196F3 !important;
    border-radius: 0 !important;
  }

  .packages .cs-package.package-price-changed {
    background-color: rgba(255, 255, 0, 0.15) !important;
    border-left: 4px solid #ff9800 !important;
    border-radius: 0 !important;
  }

  .package-tracker-reset {
    margin: 10px 0 !important;
    display: block !important;
  }
  
  .package-tracker-legend {
    margin: 10px 0;
    padding: 10px;
    background-color: #f8f8f8;
    border-radius: 4px;
    font-size: 12px;
  }
  
  .legend-item {
    display: inline-block;
    margin-right: 15px;
  }
  
  .legend-color {
    display: inline-block;
    width: 15px;
    height: 15px;
    margin-right: 5px;
    vertical-align: middle;
  }
  
  .color-new {
    background-color: rgba(144, 238, 144, 0.7);
    border: 1px solid #4CAF50;
  }
  
  .color-offer {
    background-color: rgba(173, 216, 230, 0.7);
    border: 1px solid #2196F3;
  }
  
  .color-price {
    background-color: rgba(255, 255, 0, 0.7);
    border: 1px solid #ff9800;
  }
`;
document.head.appendChild(style);

// Add reset button and legend
function addControls() {
  const container = document.querySelector('.packages');
  if (!container) return;

  // Create legend
  const legend = document.createElement('div');
  legend.className = 'package-tracker-legend';
  legend.innerHTML = `
    <div class="legend-item"><span class="legend-color color-new"></span> New Listings</div>
    <div class="legend-item"><span class="legend-color color-offer"></span> Cards/Offer % Changed</div>
    <div class="legend-item"><span class="legend-color color-price"></span> Price Only Changed</div>
  `;
  
  // Create reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Package Tracker';
  resetButton.className = 'btn btn-default package-tracker-reset';
  resetButton.type = "button";
  resetButton.onclick = async (event) => {
    event.preventDefault();
    console.log("Reset button clicked");
    isInitialized = false;
    await browser.storage.local.clear();
    console.log("Storage cleared");
    location.reload();
  };

  // Add elements to container
  container.insertBefore(legend, container.firstChild);
  container.insertBefore(resetButton, container.firstChild);
}

// Add debug button function
function addDebugButton() {
  const debugButton = document.createElement('button');
  debugButton.textContent = 'View Storage Data';
  debugButton.className = 'btn btn-default';
  debugButton.style.marginLeft = '10px';
  
  debugButton.onclick = () => {
    // This works because it executes in the content script context
    browser.storage.local.get().then(data => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '20px';
      overlay.style.left = '20px';
      overlay.style.right = '20px';
      overlay.style.backgroundColor = 'white';
      overlay.style.padding = '20px';
      overlay.style.zIndex = '10000';
      overlay.style.border = '1px solid black';
      overlay.style.maxHeight = '80vh';
      overlay.style.overflow = 'auto';
      
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.onclick = () => document.body.removeChild(overlay);
      
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(data, null, 2);
      
      overlay.appendChild(closeBtn);
      overlay.appendChild(pre);
      document.body.appendChild(overlay);
    });
  };
  
  // Add it next to your reset button
  const container = document.querySelector('.packages');
  if (container) {
    container.insertBefore(debugButton, container.firstChild);
  }
}

// Add UI elements
addControls();
addDebugButton();

// Try initialization every second until successful
const initInterval = setInterval(() => {
  if (!isInitialized) {
    initializeState();
  } else {
    clearInterval(initInterval);
  }
}, 1000);

// Watch for DOM changes
const observer = new MutationObserver((mutations) => {
  if (!isInitialized) {
    initializeState();
  }
});

observer.observe(document.querySelector('.packages'), {
  childList: true,
  subtree: true
});
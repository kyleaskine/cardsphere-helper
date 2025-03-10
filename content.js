// content.js
console.log('Content script loaded');

let isInitialized = false;
let newCount = 0;
let offerChangedCount = 0;
let priceChangedCount = 0;
let legendElement = null;

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
      quantity: li.textContent.match(/(\d+)x/)?.[1] || '1',
      element: li // Store reference to the DOM element
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
    
  return {
    username,
    total,
    efficiencyText,
    efficiencyPercentage,
    cards,
    element: pkg // Store reference to the DOM element
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

// Function to display old price information
function displayOldPriceInfo(cardElement, oldPrice, oldEfficiencyText) {
  // Create old price display element
  const oldPriceElement = document.createElement('div');
  oldPriceElement.className = 'old-price-info';
  
  // Create price span
  const priceSpan = document.createElement('span');
  priceSpan.className = 'old-price';
  priceSpan.textContent = oldPrice;
  oldPriceElement.appendChild(priceSpan);
  
  // Add space
  oldPriceElement.appendChild(document.createTextNode(' '));
  
  // Create efficiency span
  const efficiencySpan = document.createElement('span');
  efficiencySpan.className = 'old-efficiency';
  efficiencySpan.textContent = oldEfficiencyText;
  oldPriceElement.appendChild(efficiencySpan);
  
  // Insert after the current price
  cardElement.appendChild(oldPriceElement);
}

// Function to display old package total
function displayOldPackageTotal(packageElement, oldTotal, oldEfficiencyText) {
  const heading = packageElement.querySelector('.package-heading');
  if (!heading) return;
  
  // Create old total display element
  const oldTotalElement = document.createElement('div');
  oldTotalElement.className = 'old-package-total';
  
  // Create label span
  const labelSpan = document.createElement('span');
  labelSpan.className = 'old-total-label';
  labelSpan.textContent = 'Previous: ';
  oldTotalElement.appendChild(labelSpan);
  
  // Create total span
  const totalSpan = document.createElement('span');
  totalSpan.className = 'old-total';
  totalSpan.textContent = oldTotal;
  oldTotalElement.appendChild(totalSpan);
  
  // Add space
  oldTotalElement.appendChild(document.createTextNode(' '));
  
  // Create efficiency span
  const efficiencySpan = document.createElement('span');
  efficiencySpan.className = 'old-efficiency';
  efficiencySpan.textContent = oldEfficiencyText;
  oldTotalElement.appendChild(efficiencySpan);
  
  // Insert after the heading
  heading.appendChild(oldTotalElement);
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

  // Reset counters
  newCount = 0;
  offerChangedCount = 0;
  priceChangedCount = 0;

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
      newCount++;
      console.log('New package:', currPkg.username);
    } else {
      // The package exists, check if percentage changed
      const prevData = prevBasePackageMap.get(baseKey);
      
      if (prevData.percentageKey !== percentageKey) {
        // Percentage offer changed
        pkgElement.classList.add('package-offer-changed');
        offerChangedCount++;
        console.log('Offer changed:', currPkg.username, 
                   'from', prevData.pkg.efficiencyPercentage + '%', 
                   'to', currPkg.efficiencyPercentage + '%');
                   
        // Display old package total
        displayOldPackageTotal(pkgElement, prevData.pkg.total, prevData.pkg.efficiencyText);
      } else if (prevData.fullKey !== fullKey) {
        // Only price changed (due to index price updates)
        pkgElement.classList.add('package-price-changed');
        priceChangedCount++;
        console.log('Price changed:', currPkg.username);
        
        // Display old package total
        displayOldPackageTotal(pkgElement, prevData.pkg.total, prevData.pkg.efficiencyText);
        
        // Since only prices changed but not offers, we can match cards by name and condition
        // to show old prices for individual cards
        const prevCardMap = new Map();
        prevData.pkg.cards.forEach(card => {
          const cardKey = `${card.quantity}x ${card.name} ${card.condition}`;
          prevCardMap.set(cardKey, card);
        });
        
        // For each current card, find its previous price if available
        currPkg.cards.forEach(card => {
          const cardKey = `${card.quantity}x ${card.name} ${card.condition}`;
          if (prevCardMap.has(cardKey)) {
            const prevCard = prevCardMap.get(cardKey);
            if (prevCard.price !== card.price) {
              // Only add old price info if the price actually changed
              displayOldPriceInfo(card.element, prevCard.price, '');
            }
          }
        });
      }
    }
  });

  // Update the legend with the current counts
  updateLegendCounts();

  // Save current state with DOM references removed
  const packagesToStore = currentPackages.map(pkg => {
    // Create a copy without DOM references
    const pkgCopy = { ...pkg };
    delete pkgCopy.element;
    
    // Remove DOM references from cards too
    pkgCopy.cards = pkg.cards.map(card => {
      const cardCopy = { ...card };
      delete cardCopy.element;
      return cardCopy;
    });
    
    return pkgCopy;
  });
  
  await browser.storage.local.set({ packageData: packagesToStore });
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

  .package-tracker-buttons {
    margin: 10px 0 !important;
    display: flex !important;
  }

  .package-tracker-reset {
    margin: 0 !important;
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

  /* Old price styling */
  .old-price-info, .old-package-total {
    font-size: 12px;
    color: #999;
    text-decoration: line-through;
    margin-top: 2px;
    font-style: italic;
  }

  .old-package-total {
    margin-top: 5px;
    display: block;
  }

  .old-total-label {
    text-decoration: none;
    font-weight: bold;
  }
`;
document.head.appendChild(style);

// Modify the createLegend function to store the legend element reference
function createLegend() {
  const legend = document.createElement('div');
  legend.className = 'package-tracker-legend';
  legendElement = legend; // Store reference globally
  
  // New listings
  const newItem = document.createElement('div');
  newItem.className = 'legend-item';
  
  const newColor = document.createElement('span');
  newColor.className = 'legend-color color-new';
  newItem.appendChild(newColor);
  
  const newCountSpan = document.createElement('span');
  newCountSpan.textContent = ` New Cards/Listings (0)`;  // Start with 0
  newItem.appendChild(newCountSpan);
  legend.appendChild(newItem);
  
  // Offer % Changed
  const offerItem = document.createElement('div');
  offerItem.className = 'legend-item';
  
  const offerColor = document.createElement('span');
  offerColor.className = 'legend-color color-offer';
  offerItem.appendChild(offerColor);
  
  const offerCountSpan = document.createElement('span');
  offerCountSpan.textContent = ` Offer % Changed (0)`;  // Start with 0
  offerItem.appendChild(offerCountSpan);
  legend.appendChild(offerItem);
  
  // Price Only Changed
  const priceItem = document.createElement('div');
  priceItem.className = 'legend-item';
  
  const priceColor = document.createElement('span');
  priceColor.className = 'legend-color color-price';
  priceItem.appendChild(priceColor);
  
  const priceCountSpan = document.createElement('span');
  priceCountSpan.textContent = ` Index Price Changed (0)`;  // Start with 0
  priceItem.appendChild(priceCountSpan);
  legend.appendChild(priceItem);
  
  return legend;
}

// Completely replace the updateLegendCounts function
function updateLegendCounts() {
  if (!legendElement) return;
  
  // Get the span elements directly from the legend element structure
  const legendItems = legendElement.querySelectorAll('.legend-item');
  if (legendItems.length >= 3) {
    // Update new count
    const newSpan = legendItems[0].querySelector('span:not(.legend-color)');
    if (newSpan) newSpan.textContent = ` New Cards/Listings (${newCount})`;
    
    // Update offer count
    const offerSpan = legendItems[1].querySelector('span:not(.legend-color)');
    if (offerSpan) offerSpan.textContent = ` Offer % Changed (${offerChangedCount})`;
    
    // Update price count
    const priceSpan = legendItems[2].querySelector('span:not(.legend-color)');
    if (priceSpan) priceSpan.textContent = ` Index Price Changed (${priceChangedCount})`;
  }
}

// Add reset button and legend
function addControls() {
  const container = document.querySelector('.packages');
  if (!container) return;

  // Create a button container div to hold both buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'package-tracker-buttons';
  
  // Create reset button
  const resetButton = document.createElement('button');
  resetButton.textContent = 'Reset Package Tracker';
  resetButton.className = 'btn btn-default package-tracker-reset';
  resetButton.type = "button";
  resetButton.onclick = async (event) => {
    event.preventDefault();
    console.log("Reset button clicked");
    isInitialized = false;
    newCount = 0;
    offerChangedCount = 0;
    priceChangedCount = 0;
    await browser.storage.local.clear();
    console.log("Storage cleared");
    location.reload();
  };
  
  // Create debug button
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

  // Create legend using DOM methods and initial counts
  const legend = createLegend(newCount, offerChangedCount, priceChangedCount);
  
  // Add buttons to button container
  buttonContainer.appendChild(resetButton);
  buttonContainer.appendChild(debugButton);

  // Add elements to container
  container.insertBefore(legend, container.firstChild);
  container.insertBefore(buttonContainer, container.firstChild);
}

// We don't need a separate addDebugButton function anymore since it's integrated into addControls

// Add UI elements
addControls();

// Track if we're in the process of initializing to prevent double init
let isInitializing = false;

// Function to safely begin initialization
async function beginInitialization() {
  if (isInitialized || isInitializing) {
    console.log('Already initialized or initializing, skipping');
    return;
  }
  
  isInitializing = true;
  await initializeState();
  isInitializing = false;
}

// Start the initialization once
beginInitialization();

// Set up a mutation observer to catch dynamically loaded content,
// but make sure we only initialize once
const observer = new MutationObserver((mutations) => {
  if (!isInitialized && !isInitializing) {
    console.log('DOM changes detected, starting initialization');
    beginInitialization();
  }
});

// Only observe if not already initialized
if (!isInitialized) {
  const packagesContainer = document.querySelector('.packages');
  if (packagesContainer) {
    observer.observe(packagesContainer, {
      childList: true,
      subtree: true
    });
  }
}
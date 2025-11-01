# Vishwa Sangh Shibir 2025 Website

A modern, responsive website for the Vishwa Sangh Shibir 2025 (VSS2025) event organized by Sree Viswa Niketan.

## Event Details

- **Event**: Vishwa Sangh Shibir 2025
- **Date**: 25th - 29th December 2025
- **Location**: Kanha Shanti Vanam, SRCM Heartfulness Meditation Center
- **Address**: Kanha Village, Chegur, Telangana 509328, India
- **Participants**: 2000+ delegates from 70+ countries

## Website Features

### 🏠 Home Tab
- Hero section with event overview
- Key statistics and event details
- Mission and purpose description

### 📋 About Tab
- Detailed information about the event
- Mission and core values
- Event highlights and activities

### 📄 Documents Tab
- Letter to Approved Shibirarthi (downloadable)
- Generic Support Letter template (downloadable)
- Easy access to important documents

### 💰 Donate Tab
- Event image display
- Well-wishers contribution options (Gold/Silver)
- Souvenir advertisement options (Full Page/Half Page)
- Payment information and contact details

### 📞 Contact Tab
- Contact information
- Interactive contact form
- Event location details

### 🔐 Login Feature
- Login modal for future backend integration
- Transportation information access (to be implemented)
- Registration system integration ready

## Design Features

### Color Scheme
Based on the thematic colors from the event materials:
- **Primary**: Deep reddish-brown (#8B4513)
- **Secondary**: Light cream (#F5F5DC)
- **Accent**: Vibrant orange-red (#FF6B35)
- **Text**: Dark brown (#2C1810)

### Responsive Design
- Mobile-first approach
- Tablet and desktop optimized
- Smooth animations and transitions
- Modern UI/UX principles

## Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Firebase (Authentication, Firestore)
- **Deployment**: Vercel
- **Data Import**: Node.js script with Docker support
- **Fonts**: Inter font family for modern typography

## File Structure

```
VSS2025/
├── index.html                      # Main website with all tabs
├── styles.css                      # CSS styles and responsive design
├── script.js                       # JavaScript functionality
├── firebase-config.js              # Firebase configuration
├── import-excel-to-firebase.js     # Excel to Firebase import script
├── Dockerfile                      # Docker configuration for import
├── docker-compose.yml              # Docker Compose configuration
├── package.json                    # Node.js dependencies
├── vercel.json                     # Vercel deployment configuration
├── README.md                       # Project documentation
├── guides/                         # Setup and usage guides
│   ├── FIREBASE_SETUP_GUIDE.md
│   ├── EXCEL_IMPORT_GUIDE.md
│   └── DOCKER_IMPORT_GUIDE.md
└── docs/                           # Assets and documents
    ├── logo.png                    # Event logo
    ├── VSS2025_FA.jfif.jpg         # Event promotional image
    ├── Letter to Approved shibirarthi.docx
    └── Generic_SupportLetter_SREE VISWA NIKETAN.docx
```

## Getting Started

### Local Development
1. **Clone or download** the project files
2. **Open** `index.html` in a web browser
3. **Navigate** through the different tabs using the navigation menu
4. **Test** the interactive features:
   - Document downloads
   - Donation buttons
   - Contact form
   - Login modal

### Data Import (Excel to Firebase)

#### Option 1: Using Docker (Recommended - No Node.js installation needed)

1. **Ensure Docker is installed** ([Download Docker](https://www.docker.com/products/docker-desktop))
2. **Place your service account key** as `serviceAccountKey.json` in the project root
3. **Run the import:**
   ```bash
   docker-compose up --build
   ```

For detailed Docker instructions, see [Docker Import Guide](./guides/DOCKER_IMPORT_GUIDE.md)

#### Option 2: Using Node.js directly

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Place your service account key** as `serviceAccountKey.json` in the project root
3. **Run the import:**
   ```bash
   npm run import
   ```

For detailed instructions, see [Excel Import Guide](./guides/EXCEL_IMPORT_GUIDE.md)

### Deployment on Vercel
1. **Push your code** to a GitHub repository
2. **Connect to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Deploy with default settings
3. **Your website will be live** with a Vercel URL
4. **All images and functionality** will work perfectly on the deployed site

## Features Implemented

### ✅ Completed
- [x] Thematic color scheme from event materials
- [x] Responsive navigation with tab system
- [x] Documents tab with downloadable content
- [x] Donate tab with event image and donation options
- [x] Download Support Letter functionality
- [x] Login button with modal (ready for backend integration)
- [x] Contact form with validation
- [x] Modern, professional design
- [x] Mobile-responsive layout
- [x] Smooth animations and transitions

### 🔄 Future Enhancements
- [ ] Backend integration for login system
- [ ] Transportation information portal
- [ ] Registration system
- [ ] Payment gateway integration
- [ ] Multi-language support
- [ ] Event schedule and agenda
- [ ] Photo gallery
- [ ] News and updates section

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Contact Information

For technical support or questions about the website:
- **Phone**: +91-90000 04096
- **Email**: info@vss2025.org
- **Address**: 101, Viswa Residency, Chitra Layout, L. B. Nagar, Hyderabad - 500074

## License

This website is created for the Vishwa Sangh Shibir 2025 event. All rights reserved.

---

**धर्मे सर्वं प्रतिष्ठितम्**  
*DHARMA IS THE FOUNDATION OF EVERYTHING*

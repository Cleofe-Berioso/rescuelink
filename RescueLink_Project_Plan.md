# RescueLink Project Plan

## Project Title

**RescueLink: A Mobile and Web-Based Emergency Request and Multi-Agency Response Coordination System**

## Project Overview

RescueLink is a proposed emergency response system designed to help citizens request assistance during emergencies by using a mobile application. The system allows a person in danger, or a person reporting an emergency, to submit a request with a photo, description, contact details, and GPS location.

The submitted emergency report will be sent to a web-based dashboard used by the three response units: **DRRM**, **BFP**, and **Police/PNP**. These response units can view the uploaded image, location, and emergency details. The system will not automatically decide who should respond. Instead, authorized personnel from the response units will manually review the report and choose who will respond to the danger area.

This project improves the original DRRM-only concept by expanding the system into a **multi-agency emergency coordination platform**.

---

## Main Purpose

The main purpose of RescueLink is to provide a faster, more organized, and location-based emergency reporting and response coordination system.

Instead of relying only on phone calls, verbal directions, and manual reporting, the system allows emergency reports to include visual proof and exact location data. This helps responders understand the situation faster and locate the emergency area more accurately.

---

## Target Users

### 1. Mobile Users / Citizens

These are people who need help or people who are reporting an emergency.

They can:

- Send an emergency request
- Upload a photo of the incident
- Share GPS location
- Add short description
- Provide contact number
- Track the status of the emergency request

### 2. DRRM / DRRMO Personnel

DRRM handles disaster-related emergencies and rescue coordination.

They may respond to:

- Flooding
- Landslides
- Earthquakes
- Trapped persons
- Evacuation needs
- Disaster damage
- General rescue operations

### 3. BFP Personnel

BFP handles fire-related emergencies.

They may respond to:

- Fire incidents
- Smoke reports
- Burning houses or buildings
- Gas leaks
- Electrical fire risks
- Fire rescue situations

### 4. Police / PNP Personnel

Police/PNP handles public safety and security-related emergencies.

They may respond to:

- Crime incidents
- Violence
- Threats
- Road accidents
- Suspicious activity
- Missing persons
- Public safety concerns

### 5. System Administrator

The administrator manages users, roles, response unit accounts, and system records.

They can:

- Manage response unit accounts
- Manage citizen/user accounts if needed
- View system activity logs
- Monitor incident records
- Configure emergency categories
- Generate reports

---

## Platform Structure

RescueLink will have two main platforms:

## A. Mobile Application

The mobile application is for citizens or emergency reporters.

### Main Mobile Features

- User registration/login or basic emergency reporting profile
- Emergency request submission
- Photo upload
- GPS location sharing
- Emergency description field
- Contact number field
- Request status tracking
- Emergency history for the user
- Optional push notification for status updates

### Mobile App Purpose

The mobile app is the fastest way for people to ask for help. A user can open the app, upload a picture, share location, and send the emergency request.

---

## B. Web-Based Dashboard

The website is for the three response units: DRRM, BFP, and Police/PNP.

### Main Website Features

- Login for response unit personnel
- Role-based dashboard for DRRM, BFP, and Police
- Incoming emergency report list
- Uploaded photo viewer
- Map-based location viewer
- Emergency details page
- Respond / Accept button
- Dispatch status update
- Incident status tracking
- Multi-unit response support
- Incident history and records
- Reports and analytics

### Website Purpose

The web dashboard allows the response units to monitor all incoming emergency requests and manually decide who should respond.

---

## Core System Logic

The system will follow this logic:

1. A mobile user submits an emergency request.
2. The user uploads a photo, shares GPS location, and adds a short description.
3. The report is saved in the system database.
4. The report appears in the web dashboards of DRRM, BFP, and Police/PNP.
5. All three response units can view the uploaded photo, location, and emergency details.
6. The system does not automatically choose the responder.
7. Authorized response unit personnel manually review the emergency report.
8. The appropriate unit clicks **Respond**, **Accept**, or **Dispatch Team**.
9. The selected response unit goes to the danger area.
10. The emergency status is updated until the incident is resolved.

---

## Simple System Flow

**Mobile user uploads photo + location**  
↓  
**System sends report to web dashboard**  
↓  
**DRRM, BFP, and Police receive/view the report**  
↓  
**Correct response unit reviews and clicks “Respond”**  
↓  
**Selected unit goes to the danger area**  
↓  
**Status is updated until resolved**

---

## Response Unit Routing Logic

The system will notify all three response units when an emergency report is submitted. The purpose is to make sure the report is visible to all possible responders.

The response will be manually selected by the personnel.

### Example Routing

- If the photo or description shows **fire**, BFP may click **Respond**.
- If the photo or description shows **flood, disaster damage, or trapped person**, DRRM may click **Respond**.
- If the photo or description shows **crime, threat, violence, or road accident**, Police/PNP may click **Respond**.
- If the situation needs more than one unit, multiple units can respond.

### Multi-Unit Response Examples

- Fire with trapped person: **BFP + DRRM**
- Road accident with public safety concern: **Police + DRRM**
- Flood evacuation with crowd control: **DRRM + Police**
- Fire caused by suspected criminal activity: **BFP + Police**

---

## Emergency Status Flow

Recommended emergency status values:

1. **Pending** – emergency report has been submitted but not yet accepted
2. **Viewed** – response units have opened or reviewed the report
3. **Accepted** – one or more response units accepted the incident
4. **Dispatched** – response team has been sent to the danger area
5. **In Progress** – response operation is ongoing
6. **Resolved** – incident has been handled
7. **Cancelled** – report was invalid, duplicate, or cancelled

---

## Main Modules

## 1. Mobile Emergency Request Module

This module allows citizens to submit emergency requests.

### Features

- Emergency request form
- Image/photo upload
- GPS location capture
- Emergency description
- Contact information
- Submit request button
- Request confirmation page

---

## 2. Location Sharing Module

This module captures and stores the user’s emergency location.

### Features

- GPS coordinate capture
- Latitude and longitude storage
- Map preview before submission
- Location display on response dashboard

---

## 3. Multi-Agency Dashboard Module

This module allows DRRM, BFP, and Police to view emergency reports.

### Features

- Incoming report list
- Emergency report details
- Uploaded photo viewer
- Location map
- Emergency status
- Report timestamp
- Reporter contact information

---

## 4. Manual Response Selection Module

This module allows response units to manually accept and respond to incidents.

### Features

- Respond button
- Accept incident button
- Assign response team
- Multi-unit response support
- Response notes
- Dispatch confirmation

---

## 5. Incident Status Tracking Module

This module tracks the emergency from submission to resolution.

### Features

- Pending status
- Accepted status
- Dispatched status
- In Progress status
- Resolved status
- Cancelled status
- Status update history

---

## 6. Notification Module

This module alerts response units and users about updates.

### Features

- New emergency alert on dashboard
- Status update notification for mobile user
- Optional web notification
- Optional email notification
- Optional future SMS notification

---

## 7. Incident Record Management Module

This module stores all emergency reports and response actions.

### Features

- Incident history
- Response logs
- Uploaded photo records
- Location records
- Responder action records
- Date and time logs
- Report generation

---

## Recommended Technology Stack

## Mobile App

**React Native + Expo**

Use for:

- Mobile emergency reporting
- Image upload
- GPS location access
- Status tracking
- Push notifications in future development

Reason:

React Native with Expo is easier for building mobile apps because it supports device features such as camera, image picker, and location access.

---

## Web Dashboard

**React + Tailwind CSS**

Use for:

- DRRM dashboard
- BFP dashboard
- Police dashboard
- Admin dashboard
- Incident monitoring
- Map viewer
- Response status updates

Reason:

React is flexible and widely used for building dynamic dashboards and role-based UI. Tailwind CSS makes the interface easier to design and keeps styles consistent.

---

## Backend and Database

**Django + SQLite3**

Use for:

- User accounts
- Response unit accounts
- Emergency reports
- Uploaded image links
- GPS coordinates
- Incident status
- Response history
- API endpoints for the React frontend and mobile app

Reason:

Django provides a built-in ORM, admin panel, authentication system, and REST API support via Django REST Framework. SQLite3 is simple, file-based, and requires no separate database server, making it easy to set up for development and small-scale deployment.

---

## Map and Location

**Leaflet + OpenStreetMap**

Use for:

- Viewing emergency location
- Displaying incident pins
- Showing danger area on dashboard
- Map-based monitoring

Reason:

Leaflet is lightweight and easier to use for web-based maps. OpenStreetMap can reduce dependency on paid map services.

---

## Authentication

**Django Built-in Authentication**

Django includes a built-in authentication system that handles user login, logout, session management, and role-based access control out of the box. The React frontend and mobile app will authenticate using token-based auth via Django REST Framework (DRF) token authentication or JWT.

### Recommendation

Use **Django's built-in auth with DRF token authentication** so both the React web dashboard and the mobile app can share the same authentication backend.

---

## File Storage

**Local `.uploads` Folder**

Use for:

- Emergency photos
- Incident evidence
- Uploaded images from mobile users

---

## Hosting and Deployment

### Website

**Django Development Server / Python-compatible hosting (e.g., Railway, Render, or PythonAnywhere)**

Use for hosting the Django backend API and serving the React frontend build.

### Mobile

**Expo Application Services / EAS Build**

Use for building Android or iOS app packages.

### Database and Storage

**SQLite3 database file + local `.uploads` folder**

SQLite3 stores all data in a single file bundled with the Django project. The `.uploads` folder stores emergency photos and uploaded images on the server.

---

## Suggested Database Tables

## 1. users

Stores all user accounts.

Suggested fields:

- id
- full_name
- email
- phone_number
- password_hash or auth_provider_id
- role
- created_at
- updated_at

Roles may include:

- CITIZEN
- DRRM
- BFP
- POLICE
- ADMIN

---

## 2. emergency_reports

Stores emergency requests from mobile users.

Suggested fields:

- id
- reporter_id
- emergency_description
- image_url
- latitude
- longitude
- address_text
- status
- created_at
- updated_at

---

## 3. response_units

Stores the three response unit types.

Suggested fields:

- id
- name
- type
- contact_number
- station_address
- created_at
- updated_at

Types:

- DRRM
- BFP
- POLICE

---

## 4. incident_responses

Stores which response unit accepted or responded to an incident.

Suggested fields:

- id
- emergency_report_id
- response_unit_id
- responder_user_id
- response_status
- response_notes
- accepted_at
- dispatched_at
- resolved_at

---

## 5. incident_status_history

Stores every status update made to an emergency report.

Suggested fields:

- id
- emergency_report_id
- status
- updated_by
- remarks
- created_at

---

## 6. notifications

Stores system notifications.

Suggested fields:

- id
- user_id
- emergency_report_id
- title
- message
- is_read
- created_at

---

## Role-Based Access Rules

### Citizen / Mobile User

Can:

- Submit emergency request
- Upload photo
- Share location
- View own emergency request status

Cannot:

- View other users’ reports
- Accept incidents
- Manage response units

---

### DRRM User

Can:

- View incoming emergency reports
- View photo and location
- Accept incidents related to rescue/disaster
- Update status of accepted incidents
- Add response notes

Cannot:

- Manage system-wide admin settings unless given admin rights

---

### BFP User

Can:

- View incoming emergency reports
- View photo and location
- Accept fire-related incidents
- Update status of accepted incidents
- Add response notes

---

### Police User

Can:

- View incoming emergency reports
- View photo and location
- Accept public safety/security-related incidents
- Update status of accepted incidents
- Add response notes

---

### Admin

Can:

- Manage user accounts
- Manage response unit accounts
- View all incident records
- Configure emergency categories
- Generate reports
- Review system logs

---

## Scope of the System

The system will include:

- Mobile emergency request submission
- Photo upload for emergency evidence
- GPS location sharing
- Web dashboard for DRRM, BFP, and Police
- Manual response unit selection
- Multi-unit response support
- Map-based incident monitoring
- Emergency status tracking
- Notification alerts
- Incident record keeping
- Response history
- Basic reports and analytics

---

## Limitations of the System

The system will have the following limitations:

- The system depends on internet access.
- The system depends on the GPS accuracy of the user’s device.
- The system will not automatically decide the correct responder.
- The system will not use advanced AI image recognition in the initial version.
- The uploaded photo will only serve as supporting evidence.
- The system may not include SMS alerts in the initial version.
- The system may not work during power outage or network outage unless supported by backup systems.
- The system will not replace official emergency hotlines.
- The system will only support DRRM, BFP, and Police as the initial response units.
- Ambulance, hospital, and barangay integrations may be added in future development.

---

## Important Safety Rule

The system should not fully automate emergency dispatch decisions.

The uploaded image, description, and location should help response units understand the emergency, but the final response decision should be made manually by authorized personnel.

This prevents wrong dispatching caused by unclear photos, fake reports, low-quality images, or incomplete information.

---

## Recommended Development Phases

## Phase 1: Planning and Requirements

Tasks:

- Finalize system title
- Finalize target users
- Finalize response units
- Define mobile and web features
- Prepare system diagrams
- Prepare database design
- Prepare UI wireframes

Outputs:

- Project proposal
- System requirements
- User roles
- Workflow diagram
- Initial database plan

---

## Phase 2: Backend and Database Setup

Tasks:

- Set up Django project
- Configure SQLite3 database
- Create Django models (users, emergency reports, responses, notifications)
- Set up Django admin panel
- Set up Django REST Framework
- Configure token-based authentication
- Set up `.uploads` folder for emergency photos
- Create emergency report API
- Create response unit API
- Create incident status API

Outputs:

- Working Django backend
- SQLite3 database configured
- Authentication setup
- REST API routes
- `.uploads` folder for uploaded images

---

## Phase 3: Mobile App Development

Tasks:

- Create React Native Expo app
- Build login/register screen
- Build emergency request form
- Add image upload
- Add GPS location capture
- Add submit request function
- Add request status tracking page

Outputs:

- Working citizen mobile app
- Emergency request submission
- Photo and location upload

---

## Phase 4: Web Dashboard Development

Tasks:

- Create React web app
- Build login page
- Build DRRM dashboard
- Build BFP dashboard
- Build Police dashboard
- Build incoming report list
- Build incident details page
- Add uploaded image viewer
- Add map location viewer
- Add Respond/Accept button
- Add status update controls
- Connect React frontend to Django REST API

Outputs:

- Working web dashboard
- Response unit access
- Manual response selection
- Incident monitoring

---

## Phase 5: Realtime and Notification Features

Tasks:

- Add realtime incoming report updates
- Add dashboard alert for new reports
- Add mobile status update notification
- Add notification records
- Add unread notification badge

Outputs:

- Realtime emergency dashboard
- User status notifications
- Response unit alerts

---

## Phase 6: Testing and Validation

Tasks:

- Test emergency request submission
- Test photo upload
- Test GPS location accuracy
- Test dashboard report viewing
- Test manual response acceptance
- Test multi-unit response
- Test status updates
- Test role-based access
- Test invalid or duplicate reports

Outputs:

- Test report
- Bug fixes
- Validation results
- User evaluation feedback

---

## Phase 7: Deployment and Final Documentation

Tasks:

- Deploy Django backend and React frontend to chosen hosting
- Build mobile app using Expo/EAS
- Finalize SQLite3 database and .uploads folder settings
- Prepare user manual
- Prepare admin manual
- Prepare final capstone documentation
- Prepare defense presentation

Outputs:

- Deployed web dashboard
- Mobile app build
- Final documentation
- Defense-ready system

---

## Recommended Minimum Viable Product

For the first working version, focus only on the most important features.

### Mobile MVP

- Submit emergency request
- Upload photo
- Share GPS location
- Add description
- Track status

### Web MVP

- Login for DRRM, BFP, and Police
- View incoming reports
- View uploaded photo
- View location on map
- Click Respond
- Update status
- View incident history

### Admin MVP

- Manage users
- Manage response unit accounts
- View all incidents

---

## Future Enhancements

Possible future improvements:

- SMS alerts
- Push notifications
- Ambulance/EMS integration
- Hospital integration
- Barangay responder integration
- AI-assisted image classification
- Hotline integration
- Offline emergency reporting
- Panic button widget
- Live responder tracking
- Emergency heatmap analytics
- Automatic nearest station suggestion
- QR-based responder verification

---

## Final Recommended Architecture

**Mobile App: React Native + Expo**  
↓  
**Backend: Django + Django REST Framework**  
↓  
**Database: SQLite3**  
↓  
**Storage: `.uploads` folder for uploaded emergency photos**  
↓  
**Web Dashboard: React + Tailwind CSS**  
↓  
**Map: Leaflet + OpenStreetMap**

---

## Final Summary

RescueLink should be developed as a mobile and web-based emergency response coordination system. The mobile application will be used by citizens who need help, while the website will be used by DRRM, BFP, and Police/PNP response units.

When a citizen submits an emergency request, the uploaded photo, GPS location, and description will be sent to all three response units. The response units will manually review the emergency report and decide who should respond. The system supports single-unit and multi-unit response, making it more flexible for different emergency situations.

The recommended stack is **React Native + Expo for mobile**, **React + Tailwind CSS for the website**, and **Django + SQLite3 for the backend and database**, with a local `.uploads` folder for storing emergency photos.


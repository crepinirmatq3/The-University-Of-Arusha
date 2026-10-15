
/* =====================================
   1. MOBILE NAVIGATION MENU
===================================== */

const navLinks = document.getElementById("navLinks");

function showMenu() {
    if (navLinks) {
        navLinks.style.right = "0";
    }
}

function hideMenu() {
    if (navLinks) {
        navLinks.style.right = "-250px";
    }
}


/* =====================================
   2. CLOSE MOBILE MENU AFTER CLICKING
   A NAVIGATION LINK
===================================== */

if (navLinks) {
    const menuLinks = navLinks.querySelectorAll("a");

    menuLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            hideMenu();
        });
    });
}


/* =====================================
   3. APPLICATION FORM VALIDATION
===================================== */

const applicationForm = document.querySelector(".application-form");

if (applicationForm) {
    applicationForm.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!applicationForm.checkValidity()) {
            applicationForm.reportValidity();
            return;
        }

        const fullName =
            document.getElementById("fullname").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const programme =
            document.getElementById("programme").value;

        if (!fullName || !email || !programme) {
            alert("Please complete all required fields.");
            return;
        }

        alert(
            "Thank you, " + fullName + "!\n\n" +
            "Your form has passed browser validation.\n" +
            "Programme: " + programme + "\n\n" +
            "This is a demonstration only. Your application " +
            "has NOT been saved to the university database."
        );
    });
}


/* =====================================
   4. CURRENT YEAR IN THE FOOTER
===================================== */

const footerYear = document.querySelector(".ua-footer-bottom p");

if (footerYear) {
    footerYear.innerHTML =
        "&copy; " + new Date().getFullYear() +
        " The University of Arusha. All Rights Reserved.";
}


/* =====================================
   5. BACK TO TOP BUTTON
===================================== */

const backToTop = document.getElementById("backToTop");

if (backToTop) {
    window.addEventListener("scroll", function () {
        if (window.scrollY > 300) {
            backToTop.style.display = "block";
        } else {
            backToTop.style.display = "none";
        }
    });

    backToTop.addEventListener("click", function () {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
}


/* =====================================
   6. HOMEPAGE IMAGE SLIDESHOW
===================================== */

// Add class="home-slide" to each slideshow image.
// This code works when those images are present.

const slides = document.querySelectorAll(".home-slide");

if (slides.length > 1) {
    let currentSlide = 0;

    slides.forEach(function (slide, index) {
        slide.style.display = index === 0 ? "block" : "none";
    });

    setInterval(function () {
        slides[currentSlide].style.display = "none";

        currentSlide = (currentSlide + 1) % slides.length;

        slides[currentSlide].style.display = "block";
    }, 10000);
}

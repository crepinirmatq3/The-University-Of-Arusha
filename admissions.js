const applicationForms = document.querySelectorAll("[data-application-form]");

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result));
        reader.addEventListener("error", () => reject(new Error("Could not read the selected document.")));
        reader.readAsDataURL(file);
    });
}

applicationForms.forEach((form) => {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const status = form.querySelector(".application-status");
        const submitButton = form.querySelector("[type=submit]");
        const formData = new FormData(form);
        const attachmentFile = formData.get("documents");
        const fields = Object.fromEntries(formData.entries());
        delete fields.documents;
        status.textContent = "";
        submitButton.disabled = true;

        try {
            let attachment = null;
            if (attachmentFile instanceof File && attachmentFile.size > 0) {
                if (attachmentFile.size > 5 * 1024 * 1024) {
                    throw new Error("Supporting documents must be no larger than 5 MB.");
                }
                attachment = {
                    name: attachmentFile.name,
                    data: await readFileAsDataUrl(attachmentFile)
                };
            }

            const response = await fetch("/api/applications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fields, attachment })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Your application could not be submitted.");

            form.reset();
            status.textContent = "Your application has been submitted successfully.";
        } catch (error) {
            status.textContent = error.message;
        } finally {
            submitButton.disabled = false;
        }
    });
});
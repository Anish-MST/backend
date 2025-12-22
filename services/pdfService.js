import PDFDocument from 'pdfkit';
import getStream from 'get-stream';

/**
 * Generates a Provisional Offer Letter PDF.
 * @param {object} candidate - The candidate's data { name, role, salary }.
 * @returns {Promise<Buffer>} A promise that resolves with the PDF buffer.
 */
async function generateProvisionalOffer({ name, role, salary }) {
  const doc = new PDFDocument({ margin: 50 });

  // ... (PDF content generation code remains the same) ...
  doc.fontSize(18).font('Helvetica-Bold').text('Provisional Offer Letter', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(11).font('Helvetica');
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  doc.moveDown();
  doc.text(`Dear ${name},`);
  doc.moveDown();
  doc.text('We are pleased to provisionally offer you the position...'); // Truncated for brevity
  doc.moveDown(2);
  doc.text('Sincerely,');
  doc.text('The HR Team');

  // Finalize the PDF and get the buffer
  doc.end();

  // THE FIX: Call getStream.buffer() directly on the imported object.
  return await getStream.buffer(doc);
}

/**
 * Generates a Final Offer Letter PDF.
 * @param {object} candidate - The candidate's data { name, role, salary }.
 * @returns {Promise<Buffer>} A promise that resolves with the PDF buffer.
 */
async function generateFinalOffer({ name, role, salary }) {
  const doc = new PDFDocument({ margin: 50 });

  // ... (PDF content generation code remains the same) ...
  doc.fontSize(18).font('Helvetica-Bold').text('Final Offer Letter', { align: 'center' });
  doc.moveDown(2);
  doc.text(`Dear ${name},`);
  doc.moveDown();
  doc.text('We are delighted to confirm your appointment...'); // Truncated for brevity
  doc.moveDown(2);
  doc.text('Best Regards,');
  doc.text('The HR Team');

  // Finalize the PDF and get the buffer
  doc.end();
  
  // THE FIX: Call getStream.buffer() directly on the imported object.
  return await getStream.buffer(doc);
}

// Export the functions using the ES Module syntax
export {
  generateProvisionalOffer,
  generateFinalOffer,
};
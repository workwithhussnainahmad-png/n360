"use client";

type Offering = { id: number; title: string; description: string | null };
type RequiredDocument = { name: string; instructions: string | null };

export type OfflineAdmissionFormProps = {
  campusName: string | null;
  institution: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  cycle: {
    name: string;
    academicYear: string;
    instructions: string | null;
    requiredDocuments: RequiredDocument[];
    requiresTest: boolean;
    testDate: string | null;
    testLocation: string | null;
    testInstructions: string | null;
    requiresInterview: boolean;
    interviewDate: string | null;
    interviewLocation: string | null;
    interviewInstructions: string | null;
    admissionFeeAmount: number | null;
    admissionFeeDueDays: number;
    admissionFeeInstructions: string | null;
    paymentBankName: string | null;
    paymentAccountNumber: string | null;
    paymentQrUrl: string | null;

  };
  offerings: Offering[];
  accentColor: string;
};

function Lines({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="offline-line" />
      ))}
    </>
  );
}

export function OfflineAdmissionForm({
  campusName,
  institution,
  cycle,
  offerings,
  accentColor,
}: OfflineAdmissionFormProps) {
  return (
    <div>
      <button
        type="button"
        disabled={!campusName}
        onClick={() => window.print()}
        className="inline-flex h-12 items-center justify-center border border-black/15 bg-white px-5 text-sm font-bold text-[#171c1a] transition hover:border-black"
      >
        Print / save offline form
      </button>

      <article className="offline-admission-form" aria-hidden="true">
        <header className="offline-form-header">
          <div className="offline-brand">
            {institution.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={institution.logoUrl} alt="" />
            ) : (
              <span>{institution.name.slice(0, 2).toUpperCase()}</span>
            )}
            <div>
              <h1>{institution.name}</h1>
              <p>
                {institution.address ||
                  "Institution address: ______________________________"}
              </p>
              {(institution.phone || institution.email) && (
                <p>
                  {[institution.phone, institution.email]
                    .filter(Boolean)
                    .join("  |  ")}
                </p>
              )}
            </div>
          </div>
          <div className="offline-photo">
            Recent
            <br />
            photograph
          </div>
        </header>

        <div className="offline-title">
          <p>Offline admission application</p>
          <h2>
            {cycle.name} · Academic year {cycle.academicYear}
          </h2>
          <p>Campus name: <strong>{campusName}</strong></p>
        </div>

        <section className="offline-office-strip">
          <strong>For office use:</strong>
          <span>Application no. __________________</span>
          <span>Received on __________________</span>
          <span>Received by __________________</span>
        </section>

        <section>
          <h3>1. Program or class applied for</h3>
          <div className="offline-options">
            {offerings.map((offering) => (
              <label key={offering.id}>
                <i /> {offering.title}
              </label>
            ))}
          </div>
          <p className="offline-field">
            <b>Second preference (optional):</b>{" "}
            ______________________________________________
          </p>
        </section>

        <section>
          <h3>2. Student information</h3>
          <div className="offline-grid two">
            <p className="offline-field">
              <b>Full name (as on B-Form/birth certificate)</b>
              <Lines />
            </p>
            <p className="offline-field">
              <b>Name in Urdu (optional)</b>
              <Lines />
            </p>
            <p className="offline-field">
              <b>Date of birth</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Gender</b>
              <span className="offline-choices">
                □ Male &nbsp; □ Female &nbsp; □ Other
              </span>
            </p>
            <p className="offline-field">
              <b>B-Form/CNIC number</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Nationality</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Blood group (if known)</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Student mobile (if applicable)</b>
              <Lines count={1} />
            </p>
          </div>
          <p className="offline-field">
            <b>Home address</b>
            <Lines />
          </p>
          <div className="offline-grid two">
            <p className="offline-field">
              <b>City / district</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Postal address (if different)</b>
              <Lines count={1} />
            </p>
          </div>
        </section>

        <section>
          <h3>3. Parent or guardian information</h3>
          <div className="offline-grid two">
            <p className="offline-field">
              <b>Parent/guardian full name</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Relationship to student</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>CNIC number</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Occupation</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Primary mobile number</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Alternative mobile number</b>
              <Lines count={1} />
            </p>
          </div>
          <p className="offline-field">
            <b>Email address (write clearly)</b>
            <Lines count={1} />
          </p>
          <p className="offline-note">
            This email and phone number will be used for admission updates and
            applicant-portal access.
          </p>
          <div className="offline-grid two">
            <p className="offline-field">
              <b>Emergency contact name</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Emergency contact phone</b>
              <Lines count={1} />
            </p>
          </div>
        </section>

        <section>
          <h3>4. Previous education</h3>
          <div className="offline-grid two">
            <p className="offline-field">
              <b>Previous school/institution</b>
              <Lines count={1} />
            </p>
            <p className="offline-field">
              <b>Most recent class marks</b>
              <span className="offline-marks">
                Obtained __________ / Total __________
              </span>
            </p>
          </div>
        </section>

        <section>
          <h3>5. Health and support information</h3>
          <p className="offline-field">
            <b>
              Allergies, medical conditions, medicines, disabilities, or
              emergency instructions
            </b>
            <Lines count={3} />
          </p>
          <p className="offline-note">
            Write “None” if there is nothing to report. This information helps
            the institution provide safe support.
          </p>
        </section>

        <section>
          <h3>6. Documents to attach</h3>
          <p className="offline-note offline-attach-note">
            Attach clear photocopies or printed copies with this paper form. Do
            not write file-upload instructions on the form.
          </p>
          <div className="offline-checklist">
            {cycle.requiredDocuments.length > 0 ? (
              cycle.requiredDocuments.map((document) => (
                <div key={document.name}>
                  <i /> <strong>{document.name}</strong>
                </div>
              ))
            ) : (
              <>
                <div>
                  <i /> Student B-Form or birth certificate copy
                </div>
                <div>
                  <i /> Parent/guardian CNIC copy
                </div>
                <div>
                  <i /> Previous result card or school record
                </div>
                <div>
                  <i /> Recent passport-size photographs
                </div>
              </>
            )}
          </div>
        </section>

        {(cycle.requiresTest ||
          cycle.requiresInterview ||
          cycle.admissionFeeAmount) && (
          <section>
            <h3>7. Admission process information</h3>
            <div className="offline-process-grid">
              {cycle.requiresTest && (
                <div className="offline-process">
                  <span>Admission test</span>
                  <b>{cycle.testDate || "Date will be communicated"}</b>
                  {cycle.testLocation && <p>{cycle.testLocation}</p>}
                  {cycle.testInstructions ? (
                    <small>{cycle.testInstructions}</small>
                  ) : null}
                </div>
              )}
              {cycle.requiresInterview && (
                <div className="offline-process">
                  <span>Interview</span>
                  <b>{cycle.interviewDate || "Date will be communicated"}</b>
                  {cycle.interviewLocation && <p>{cycle.interviewLocation}</p>}
                  {cycle.interviewInstructions ? (
                    <small>{cycle.interviewInstructions}</small>
                  ) : null}
                </div>
              )}
              {cycle.admissionFeeAmount && (
                <div className="offline-process offline-payment">
                  <span>Admission fee — only after an offer</span>
                  <b>PKR {cycle.admissionFeeAmount.toLocaleString("en-PK")}</b>
                  <p>
                    Due within {cycle.admissionFeeDueDays} day(s) of the offer
                  </p>
                  <p>
                    Please pay online via the applicant portal or contact the admissions office for payment details.
                  </p>
                  {cycle.admissionFeeInstructions ? (
                    <small>{cycle.admissionFeeInstructions}</small>
                  ) : null}
                </div>
              )}
            </div>
            <p className="offline-note">
              Submitting this form does not guarantee admission. Do not pay the
              admission fee until the institution issues an offer or payment
              request.
            </p>
          </section>
        )}

        {cycle.instructions && (
          <section className="offline-info-box">
            <h3>Applicant instructions</h3>
            <p className="offline-copy">{cycle.instructions}</p>
          </section>
        )}

        <section>
          <h3>8. Parent/guardian declaration</h3>
          <p className="offline-copy">
            I confirm that the information in this application is complete and
            correct. I understand that incorrect or concealed information may
            cause the application or admission to be cancelled. I authorize the
            institution to verify the submitted records and contact me about
            this application.
          </p>
          <div className="offline-grid three signatures">
            <p>
              <span />
              Parent/guardian signature
            </p>
            <p>
              <span />
              Student signature
            </p>
            <p>
              <span />
              Date
            </p>
          </div>
        </section>

        <section className="offline-office-box">
          <h3>Institution decision — office use only</h3>
          <p>
            Documents: □ Complete &nbsp; □ Incomplete &nbsp;&nbsp; Test: □ Pass
            □ Fail □ Not required &nbsp;&nbsp; Interview: □ Pass □ Fail □ Not
            required
          </p>
          <p>
            Decision: □ Accepted &nbsp; □ Waitlisted &nbsp; □ Rejected
            &nbsp;&nbsp; Fee status: □ Pending □ Verified
          </p>
          <p className="offline-field">
            <b>Remarks / placement / section</b>
            <Lines count={2} />
          </p>
          <div className="offline-grid two signatures">
            <p>
              <span />
              Authorized signature
            </p>
            <p>
              <span />
              Date
            </p>
          </div>
        </section>
      </article>

      <style jsx global>{`
        .offline-admission-form {
          display: none;
        }
        @media print {
          @page {
            size: A4;
            margin: 9mm;
          }
          body * {
            visibility: hidden !important;
          }
          .offline-admission-form,
          .offline-admission-form * {
            visibility: visible !important;
          }
          .offline-admission-form {
            display: block !important;
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            color: #111;
            background: #fff;
            font-family: Arial, sans-serif;
            font-size: 9.5pt;
            line-height: 1.35;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .offline-admission-form section {
            margin-top: 4mm;
          }
          .offline-admission-form h3,
          .offline-field,
          .offline-process,
          .offline-checklist > div {
            break-inside: avoid;
          }
          .offline-form-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8mm;
            border-bottom: 2px solid #111;
            padding-bottom: 4mm;
          }
          .offline-brand {
            display: flex;
            align-items: center;
            gap: 4mm;
          }
          .offline-brand img,
          .offline-brand > span {
            width: 18mm;
            height: 18mm;
            object-fit: contain;
            border: 1px solid #bbb;
            display: grid;
            place-items: center;
            font-size: 15pt;
            font-weight: 700;
          }
          .offline-brand h1 {
            margin: 0;
            font-size: 17pt;
            line-height: 1.15;
          }
          .offline-brand p {
            margin: 1mm 0 0;
            color: #444;
            font-size: 8.5pt;
          }
          .offline-photo {
            width: 28mm;
            height: 34mm;
            border: 1px dashed #777;
            display: grid;
            place-items: center;
            text-align: center;
            color: #666;
            font-size: 8pt;
          }
          .offline-title {
            margin-top: 4mm;
            text-align: center;
          }
          .offline-title p {
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-size: 9pt;
            font-weight: 700;
          }
          .offline-title h2 {
            margin: 1mm 0 0;
            font-size: 13pt;
          }
          .offline-office-strip {
            display: grid;
            grid-template-columns: auto 1fr 1fr 1fr;
            gap: 4mm;
            padding: 2.5mm 3mm;
            border: 1px solid #999;
            background: #f3f3f3;
            font-size: 8.5pt;
          }
          .offline-admission-form h3 {
            margin: 0 0 2.5mm;
            padding: 2mm 3mm;
            background: ${accentColor};
            color: #fff;
            font-size: 10pt;
          }
          .offline-grid {
            display: grid;
            gap: 2.5mm 6mm;
          }
          .offline-grid.two {
            grid-template-columns: 1fr 1fr;
          }
          .offline-grid.three {
            grid-template-columns: 1fr 1fr 1fr;
          }
          .offline-field {
            margin: 2mm 0 0;
          }
          .offline-field b {
            display: block;
            margin-bottom: 1mm;
            font-size: 8.5pt;
          }
          .offline-line {
            display: block;
            height: 5mm;
            border-bottom: 1px solid #777;
          }
          .offline-choices {
            display: block;
            min-height: 5mm;
            padding-top: 1mm;
            border-bottom: 1px solid #777;
          }
          .offline-marks {
            display: block;
            min-height: 5mm;
            padding-top: 1mm;
            border-bottom: 1px solid #777;
          }
          .offline-options {
            display: flex;
            flex-wrap: wrap;
            gap: 2mm 7mm;
          }
          .offline-options label {
            min-width: 42mm;
          }
          .offline-options i,
          .offline-checklist i {
            display: inline-block;
            width: 3.5mm;
            height: 3.5mm;
            border: 1px solid #555;
            vertical-align: -0.5mm;
          }
          .offline-note {
            margin: 1.5mm 0 0;
            color: #555;
            font-size: 8pt;
          }
          .offline-checklist {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2.5mm 6mm;
          }
          .offline-attach-note {
            margin: 0 0 3mm;
            padding: 2mm 3mm;
            border-left: 2px solid ${accentColor};
            background: #f3f3f3;
          }
          .offline-process-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3mm;
          }
          .offline-process {
            position: relative;
            min-height: 20mm;
            border: 1px solid #bbb;
            border-top: 2px solid ${accentColor};
            padding: 3mm;
            background: #fafafa;
          }
          .offline-process > span {
            display: block;
            margin-bottom: 1.5mm;
            color: #555;
            font-size: 7.5pt;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .offline-process > b {
            display: block;
            font-size: 10pt;
          }
          .offline-process p {
            margin: 1mm 0 0;
          }
          .offline-process small {
            display: block;
            margin-top: 1.5mm;
            color: #444;
            white-space: pre-line;
          }
          .offline-payment {
            grid-column: 1 / -1;
            padding-right: 39mm;
          }
          .offline-payment-qr {
            position: absolute;
            top: 3mm;
            right: 3mm;
            width: 32mm;
            text-align: center;
          }
          .offline-payment-qr img {
            width: 27mm;
            height: 27mm;
            object-fit: contain;
            border: 1px solid #bbb;
            padding: 1mm;
          }
          .offline-payment-qr em {
            display: block;
            margin-top: 1mm;
            font-size: 6.5pt;
            font-style: normal;
            color: #555;
          }
          .offline-copy {
            margin: 0;
            padding: 3mm;
            border: 1px solid #bbb;
            background: #fafafa;
            white-space: pre-line;
            line-height: 1.5;
          }
          .signatures {
            margin-top: 8mm;
            gap: 8mm;
          }
          .signatures span {
            display: block;
            border-bottom: 1px solid #555;
            height: 7mm;
          }
          .signatures p {
            margin: 0;
            text-align: center;
            font-size: 8pt;
          }
          .offline-office-box {
            border: 1.5px solid #555;
            padding: 3mm;
          }
          .offline-office-box h3 {
            margin: -3mm -3mm 3mm;
          }
          .offline-office-box > p {
            margin: 2mm 0;
          }
        }
      `}</style>
    </div>
  );
}

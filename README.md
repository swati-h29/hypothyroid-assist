# HypothyroidAssist

HypothyroidAssist is a Clinical Decision Support Open Web App developed for integration with OpenMRS.

The application supports hypothyroidism management for adults over 18 years and pregnant women by analyzing thyroid laboratory results, monitoring TSH and Free T4 trends, providing clinical recommendations, and supporting clinical actions within the OpenMRS patient workflow.

## Project Aim

The goal of HypothyroidAssist is to provide integrated clinical decision support for hypothyroidism management.

The application supports:

- Diagnosis using TSH and Free T4 values
- Monitoring of thyroid laboratory trends
- Guideline-based treatment recommendations
- Levothyroxine dose recommendations
- Follow-up recommendations
- Laboratory ordering
- Diagnosis recording
- Medication ordering and adjustment
- Pregnancy-specific recommendations
- Recommendations for cardiac patients
- Severe hypothyroidism and myxedema scenarios

## Novelty and Innovation

HypothyroidAssist combines multiple parts of the hypothyroidism management workflow into one OpenMRS panel.

<img width="1020" height="670" alt="image" src="https://github.com/user-attachments/assets/89e642a1-b458-443d-85ac-6fc19053a3cb" />

The application provides:

- Patient-specific TSH and Free T4 trend visualization

  <img width="586" height="589" alt="image" src="https://github.com/user-attachments/assets/4c7ce935-233d-4fe7-b0e8-474cbfac0060" />

  <img width="645" height="585" alt="image" src="https://github.com/user-attachments/assets/5c90c775-4525-4483-ad00-550b4c189f39" />


- Automated thyroid condition classification
- Diagnosis recommendations

  <img width="1212" height="609" alt="image" src="https://github.com/user-attachments/assets/b33050d3-4bae-477f-ad9a-f7eb2e0c35ae" />

- Levothyroxine dose recommendations
- One-click laboratory ordering
- Medication ordering and adjustment
- Follow-up recommendations
- Direct clinical actions within the patient dashboard

  <img width="1075" height="628" alt="image" src="https://github.com/user-attachments/assets/365b8705-7a6f-4e60-ba1e-8c60ad1ecd61" />


This allows clinicians to review patient information, receive recommendations, and perform actions without leaving the patient workflow.

## Technical Architecture

HypothyroidAssist uses four main layers.

<img width="588" height="279" alt="image" src="https://github.com/user-attachments/assets/b49f1207-a868-4d5c-940b-920263bdd5da" />


## API Endpoints

| Purpose | Endpoint | Method |
|---|---|---|
| Check active session | `/session` | GET |
| Fetch patient details | `/patient/{patientUUID}?v=full` | GET |
| Fetch observations | `/obs?patient={patientUUID}&concept={conceptUUID}&limit=50&v=full` | GET |
| Fetch latest patient weight | `/obs?patient={patientUUID}&concept={WEIGHT}&limit=1&v=default` | GET |
| Fetch patient orders | `/order?patient={patientUUID}&v=default` | GET |
| Fetch full patient orders | `/order?patient={patientUUID}&v=full` | GET |
| Fetch condition history | `/conditionhistory?patientUuid={patientUUID}` | GET |
| Create encounter | `/encounter` | POST |
| Save patient condition | `/condition` | POST |
| Create lab/test order | `/order` | POST |
| Discontinue drug order | `/order` | POST |
| Create drug order | `/order` | POST |

## OpenMRS Extension Point

HypothyroidAssist is added to the OpenMRS patient dashboard using:

`patientDashboard.overallActions`

This adds the Hypothyroid Assist action to the General Actions section of the OpenMRS patient dashboard and allows clinicians to launch the application for the currently selected patient.

## Clinical Appropriateness

The clinical decision logic uses published guidance for:

- Hypothyroidism diagnosis and treatment
- Thyroid disease during pregnancy
- Subclinical thyroid disease

### TSH and Free T4 Reference Ranges

| Patient Group | TSH (mIU/L) | Free T4 (ng/dL) |
|---|---:|---:|
| Nonpregnant | 0.4 to 4.5 | 0.8 to 1.7 |
| First trimester | 0.1 to 2.5 | 0.8 to 1.2 |
| Second trimester | 0.2 to 3.0 | 0.6 to 1.0 |
| Third trimester | 0.3 to 3.0 | 0.5 to 0.8 |

## Application Demo Scenarios

### Scenario 1: Patient Without Existing Thyroid Records

The patient has symptoms related to hypothyroidism but has no recorded TSH or Free T4 results, thyroid medication, or hypothyroidism diagnosis.

The application provides options to order TSH and Free T4 laboratory tests.

 <img width="1350" height="472" alt="image" src="https://github.com/user-attachments/assets/e8369dd2-b6ce-469c-9098-fcd714c4084a" />

 Shows the diagnosis recommendation with an option to record it as a condition.

 <img width="837" height="341" alt="image" src="https://github.com/user-attachments/assets/f2807374-9d2c-483a-9a9e-94d57cec490a" />

Shows the order placement for medication and the TSH lab order

 <img width="837" height="368" alt="image" src="https://github.com/user-attachments/assets/e71b3066-c52e-44a0-9d66-59740962da66" />



### Scenario 2: Subclinical Hypothyroidism

The application:

- Provides a diagnosis recommendation

<img width="588" height="429" alt="image" src="https://github.com/user-attachments/assets/755535d4-f86a-4921-bbde-93e8ec4c15ac" />

- Allows the diagnosis to be recorded
- Provides a clinical recommendation

<img width="733" height="429" alt="image" src="https://github.com/user-attachments/assets/0f754c45-4bd8-4d83-965f-e6c62673d5b9" />



### Scenario 3: Pregnancy

The pregnancy scenarios demonstrate:

- Initial diagnosis recording
  
<img width="688" height="267" alt="image" src="https://github.com/user-attachments/assets/ef7e5c39-3a21-460d-b8da-c93e07a99390" />

- Initial recommendations for primary hypothyroidism
  
  <img width="619" height="237" alt="image" src="https://github.com/user-attachments/assets/114a24ff-45fb-4e55-940b-21201556c8fc" />

- Recall recommendation for undertreatment

  <img width="619" height="232" alt="image" src="https://github.com/user-attachments/assets/32349447-5689-4b1e-a0b7-1f3d81d01da4" />

- Recall recommendation for overtreatment

  <img width="647" height="220" alt="image" src="https://github.com/user-attachments/assets/769ffae8-e4b3-449d-ae04-48c11fcaa12f" />

- Subclinical hypothyroidism during pregnancy

  <img width="1115" height="589" alt="image" src="https://github.com/user-attachments/assets/1591f998-ff77-45de-a464-b87a07f4fc50" />



### Scenario 4: Cardiac Patients

The application provides recommendations for cardiac patients.

<img width="1076" height="555" alt="image" src="https://github.com/user-attachments/assets/1f4b4e69-905d-4f2a-8012-582a48f24ed4" />


### Scenario 5: Myxedema

The application provides recommendations for patients presenting with a myxedema scenario.

<img width="1176" height="561" alt="image" src="https://github.com/user-attachments/assets/73de6a84-2506-497d-93c2-0197ebaea432" />


## References

1. Carney, L. A., Quinlan, J. D., & West, J. M. (2014). Thyroid disease in pregnancy. American family physician, 89(4), 273–278.
   https://www.aafp.org/pubs/afp/issues/2014/0215/p273.html#hypothyroidism 

3. Evron, J. M., Hummel, S. L., Reyes-Gastelum, D., Haymart, M. R., Banerjee, M., & Papaleontiou, M. (2022). Association of Thyroid Hormone Treatment Intensity With Cardiovascular Mortality Among US Veterans. JAMA network open, 5(5), Article e2211863.
   https://doi.org/10.1001/jamanetworkopen.2022.11863

5. Mamlin, B., & Cullen, T. (2018). Public Health Decisions Using Point of Care Data from Open Source Systems in Africa. Online Journal of Public Health Informatics, 10(1), e57.
   https://doi.org/10.5210/ojphi.v10i1.8420

7. Meyer, A. N. D., Murphy, D. R., Al-Mutairi, A., Sittig, D. F., Wei, L., Russo, E., & Singh, H. (2017). Electronic Detection of Delayed Test Result Follow-Up in Patients with Hypothyroidism. Journal of General Internal Medicine, 32(7), 753-759.  
   https://doi.org/10.1007/s11606-017-3988-z

8. Wilson, G. R., & Curry, R. W., Jr. (2005). Subclinical thyroid disease. American Family Physician, 72(8), 1517-1524.  
   https://www.aafp.org/pubs/afp/issues/2005/1015/p1517.html

9. Wilson, S. A., Stem, L. A., & Bruehlman, R. D. (2021). Hypothyroidism: Diagnosis and Treatment. American Family Physician, 103(10), 605-613.  https://www.aafp.org/pubs/afp/issues/2021/0515/p605.html

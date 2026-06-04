MyPeptidePrice rolodex cache fix

Copy the files in this folder into the root of the local peptide-site repository.
Choose Replace the files in the destination when Windows asks.

This patch:
- forces browsers to load the current rolodex CSS and JavaScript
- restores the summer sales rolodex styling
- keeps mobile category filters hidden
- does not change catalog API logic

After the Netlify deployment publishes, hard-refresh the homepage once.

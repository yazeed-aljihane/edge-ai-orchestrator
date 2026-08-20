import express from 'express'
import { router } from './app.js'
let app = express()



app.use(express.json())
app.use(router)
app.get("/health", (req, res) => {
  res.send("OK");
});


app.listen(3000, () => {
  console.log('Server is running on port 3000')
})

